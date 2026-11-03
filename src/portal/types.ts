/** Neutral DTOs for portal / Impex CSV rows (no ERP storage). */

export type NoonOrderDto = {
  order_nr: string;
  status: string;
  currency: string;
  total_amount: number;
  item_count: number;
  placed_at: string;
  updated_at: string;
};

export type NoonStockDto = {
  partner_sku: string;
  warehouse_code: string;
  qty: number;
  fulfillment: "fbn" | "fbp" | "supermall" | "transit" | "unknown";
  in_transit_qty: number;
  updated_at: string;
};

export type NoonCatalogDto = {
  partner_sku: string;
  title: string;
  is_active: boolean;
  noon_sku: string;
  image_url: string;
  price: number;
  active_price?: number | null;
  list_price?: number | null;
  currency: string;
  listing_type: string;
  updated_at: string;
  stock_fbn_net?: number | null;
};

export type NoonSalesDto = {
  partner_sku: string;
  date: string;
  units: number;
  amount: number;
  updated_at: string;
};

export type NoonFeeDto = {
  partner_sku: string;
  /** 0–1 */
  commission_rate: number;
  outbound_fee: number;
  tax_amount: number;
  updated_at: string;
};

export type NoonInvoiceDto = {
  invoice_nr: string;
  invoice_type: string;
  status: string;
  currency: string;
  amount: number;
  issued_at: string | null;
  due_at: string | null;
  partner_sku: string;
  updated_at: string;
};

export type NoonAdsDto = {
  partner_sku: string;
  campaign: string;
  from_date: string;
  to_date: string;
  spend: number;
  revenue: number;
  orders: number;
  views: number;
  clicks: number;
  atc: number;
  updated_at: string;
};
