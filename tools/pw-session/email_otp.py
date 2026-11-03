# -*- coding: utf-8 -*-
"""
Fetch Noon login OTP from IMAP.

Credentials via env only (never commit):
  NOON_OTP_IMAP_HOST / PORT / USER / PASS
  NOON_OTP_IMAP_WAIT_SEC (poll timeout, default 180)
"""
from __future__ import annotations

import email
import imaplib
import os
import re
import time
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import Callable

LogFn = Callable[[str], None]


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def imap_configured() -> bool:
    return bool(_env("NOON_OTP_IMAP_USER") and _env("NOON_OTP_IMAP_PASS"))


def _decode_mime(value: str | None) -> str:
    if not value:
        return ""
    parts = []
    for chunk, enc in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(enc or "utf-8", errors="replace"))
        else:
            parts.append(str(chunk))
    return "".join(parts)


def _message_body(msg: email.message.Message) -> str:
    chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            if ctype not in ("text/plain", "text/html"):
                continue
            try:
                raw = part.get_payload(decode=True) or b""
            except Exception:
                continue
            charset = part.get_content_charset() or "utf-8"
            chunks.append(raw.decode(charset, errors="replace"))
    else:
        try:
            raw = msg.get_payload(decode=True) or b""
        except Exception:
            raw = b""
        charset = msg.get_content_charset() or "utf-8"
        chunks.append(raw.decode(charset, errors="replace"))
    return "\n".join(chunks)


def _looks_like_noon_otp(from_addr: str, subject: str, body: str) -> bool:
    blob = f"{from_addr} {subject} {body}".lower()
    keys = (
        "noon",
        "noon.partners",
        "otp",
        "verification",
        "verify",
        "one-time",
        "one time",
        "验证码",
        "登陆",
        "登录",
    )
    return any(k in blob for k in keys)


# Avoid bare \d{6} on raw HTML — CSS colors like #000000 false-positive.
_OTP_NEAR_KEYWORD = re.compile(
    r"(?:verification\s*code|one[- ]?time(?:\s*(?:password|code|passcode))?|"
    r"\botp\b|passcode|security\s*code|验证码|"
    r"(?:your|login)\s+code)\D{0,48}(\d{4,8})",
    re.I,
)
_OTP_SIX = re.compile(r"(?<![#\d])(\d{6})(?!\d)")
_OTP_FOUR_TO_EIGHT = re.compile(r"(?<![#\d])(\d{4,8})(?!\d)")


def _plain_for_otp(text: str) -> str:
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", text)
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    t = re.sub(
        r"&#(\d+);",
        lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x110000 else " ",
        t,
    )
    t = (
        t.replace("&nbsp;", " ")
        .replace("&lt;", " ")
        .replace("&gt;", " ")
        .replace("&amp;", " ")
    )
    t = re.sub(r"#[0-9a-fA-F]{3,8}\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _plausible_otp(code: str) -> bool:
    if not code or not code.isdigit() or not (4 <= len(code) <= 8):
        return False
    if len(set(code)) == 1:
        return False
    if code in ("123456", "654321", "012345", "123123"):
        return False
    return True


def extract_otp_code(text: str) -> str | None:
    if not text:
        return None
    plain = _plain_for_otp(text)
    for blob in (plain, text):
        m = _OTP_NEAR_KEYWORD.search(blob)
        if m and _plausible_otp(m.group(1)):
            return m.group(1)
    for pat in (_OTP_SIX, _OTP_FOUR_TO_EIGHT):
        for m in pat.finditer(plain):
            code = m.group(1)
            if _plausible_otp(code):
                return code
    return None


def _msg_dt(msg: email.message.Message) -> datetime | None:
    raw = msg.get("Date")
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def fetch_noon_otp(
    *,
    not_before: datetime,
    log: LogFn | None = None,
    max_messages: int = 25,
) -> str | None:
    """
    Read recent INBOX mail; return a Noon OTP newer than not_before.
    Set not_before to just before you click "send code".
    """
    _log = log or (lambda _m: None)
    host = _env("NOON_OTP_IMAP_HOST", "imap.example.com")
    port = int(_env("NOON_OTP_IMAP_PORT", "993") or "993")
    user = _env("NOON_OTP_IMAP_USER")
    password = _env("NOON_OTP_IMAP_PASS")
    if not user or not password:
        raise RuntimeError(
            "Set NOON_OTP_IMAP_USER and NOON_OTP_IMAP_PASS (IMAP mailbox for OTP mail)."
        )

    if not_before.tzinfo is None:
        not_before = not_before.replace(tzinfo=timezone.utc)

    mail = imaplib.IMAP4_SSL(host, port)
    try:
        try:
            imaplib.Commands["ID"] = ("NONAUTH", "AUTH", "SELECTED")
            mail._simple_command(  # noqa: SLF001
                "ID",
                '("name" "noon-ops-framework" "version" "0.2")',
            )
        except Exception as e:
            _log(f"[otp-imap] ID handshake skipped: {e}")

        mail.login(user, password)
        typ, _ = mail.select("INBOX")
        if typ != "OK":
            raise RuntimeError(f"IMAP SELECT INBOX failed: {typ}")

        typ, data = mail.search(None, "ALL")
        if typ != "OK" or not data or not data[0]:
            _log("[otp-imap] inbox empty")
            return None

        ids = data[0].split()
        ids = ids[-max_messages:]
        ids.reverse()

        for mid in ids:
            typ, fetched = mail.fetch(mid, "(RFC822)")
            if typ != "OK" or not fetched or not fetched[0]:
                continue
            raw = fetched[0][1]
            if not isinstance(raw, (bytes, bytearray)):
                continue
            msg = email.message_from_bytes(raw)
            dt = _msg_dt(msg)
            if dt is not None and dt < not_before:
                continue
            from_addr = _decode_mime(msg.get("From"))
            subject = _decode_mime(msg.get("Subject"))
            body = _message_body(msg)
            if not _looks_like_noon_otp(from_addr, subject, body):
                continue
            code = extract_otp_code(f"{subject}\n{body}")
            if code:
                _log(
                    f"[otp-imap] hit OTP subject={subject[:80]!r} "
                    f"date={dt.isoformat() if dt else '?'}"
                )
                return code
        return None
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def poll_noon_otp(
    *,
    not_before: datetime,
    wait_sec: float | None = None,
    poll_sec: float = 8.0,
    log: LogFn | None = None,
) -> str:
    """Poll until OTP appears or timeout."""
    _log = log or (lambda _m: None)
    if wait_sec is None:
        wait_sec = float(_env("NOON_OTP_IMAP_WAIT_SEC", "180") or "180")
    deadline = time.time() + max(30.0, wait_sec)
    last_err: str | None = None
    while time.time() < deadline:
        try:
            code = fetch_noon_otp(not_before=not_before, log=_log)
            if code:
                return code
            _log("[otp-imap] no new code yet…")
        except Exception as e:
            last_err = str(e)
            _log(f"[otp-imap] fetch error: {e}")
        time.sleep(max(3.0, poll_sec))
    raise RuntimeError(
        f"Timed out waiting for Noon OTP ({int(wait_sec)}s)"
        + (f": {last_err}" if last_err else " (no matching mail)")
    )


if __name__ == "__main__":
    import sys

    def _log(m: str) -> None:
        print(m, file=sys.stderr)

    if not imap_configured():
        print(
            "Set NOON_OTP_IMAP_USER / NOON_OTP_IMAP_PASS (and HOST if needed).",
            file=sys.stderr,
        )
        sys.exit(2)
    # Demo: look back 10 minutes
    from datetime import timedelta

    code = poll_noon_otp(
        not_before=datetime.now(timezone.utc) - timedelta(minutes=10),
        wait_sec=30,
        log=_log,
    )
    print(code)
