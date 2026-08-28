import { brl } from "@/lib/format";

export type ReceiptItem = {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
};

export type ReceiptData = {
  saleNumber: number | string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment: string;
  received?: number;
  change?: number;
  customer?: string;
  cashier?: string;
  date?: Date;
};

const COMPANY = {
  name: "MERCADO JC",
  cnpj: "35.269.764/0001-61",
  system: "Mercado JC ERP",
};

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  credito: "Cartao de Credito",
  debito: "Cartao de Debito",
  vale: "Vale",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildReceiptHtml(d: ReceiptData): string {
  const date = d.date ?? new Date();
  const rows = d.items
    .map(
      (i) => `<tr><td colspan="2" class="nm">${esc(i.name)}</td></tr>
<tr><td class="q">${i.qty} x ${brl(i.unit_price)}</td><td class="r">${brl(i.total)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Cupom ${d.saleNumber}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 76mm; margin: 0 auto; padding: 4mm 2mm; font-family: "Courier New", monospace; font-size: 11px; line-height: 1.35; color: #000; background: #fff; }
  .c { text-align: center; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .big { font-size: 14px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 0; vertical-align: top; }
  .nm { padding-top: 2px; }
  .q { white-space: nowrap; }
  .tot { font-size: 15px; font-weight: 700; }
  .sm { font-size: 9px; }
</style></head><body>
  <div class="c b big">${COMPANY.name}</div>
  <div class="c sm">CNPJ ${COMPANY.cnpj}</div>
  <hr>
  <div class="c b">CUPOM NAO FISCAL</div>
  <div class="c sm">Documento sem valor fiscal</div>
  <hr>
  <div>Cupom: ${esc(String(d.saleNumber))}</div>
  <div>Data: ${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR")}</div>
  ${d.cashier ? `<div>Operador: ${esc(d.cashier)}</div>` : ""}
  ${d.customer ? `<div>Cliente: ${esc(d.customer)}</div>` : ""}
  <hr>
  <table>
    <tr><td class="b">ITEM</td><td class="r b">VALOR</td></tr>
    ${rows}
  </table>
  <hr>
  <table>
    <tr><td>Itens</td><td class="r">${d.items.reduce((s, i) => s + i.qty, 0)}</td></tr>
    <tr><td>Subtotal</td><td class="r">${brl(d.subtotal)}</td></tr>
    <tr><td>Desconto</td><td class="r">${brl(d.discount)}</td></tr>
    <tr><td class="tot">TOTAL</td><td class="r tot">${brl(d.total)}</td></tr>
    <tr><td>Pagamento</td><td class="r">${esc(PAYMENT_LABEL[d.payment] ?? d.payment)}</td></tr>
    ${d.received != null ? `<tr><td>Valor recebido</td><td class="r">${brl(d.received)}</td></tr>` : ""}
    ${d.change != null ? `<tr><td>Troco</td><td class="r">${brl(d.change)}</td></tr>` : ""}
  </table>
  <hr>
  <div class="c">Obrigado pela preferencia!</div>
  <div class="c sm">${COMPANY.system}</div>
  <div class="c sm">&nbsp;</div>
  <div class="c sm">&nbsp;</div>
</body></html>`;
}

/** Abre a janela de impressão do cupom (compatível com impressoras térmicas 80mm). */
export function printReceipt(d: ReceiptData) {
  const html = buildReceiptHtml(d);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  if (iframe.contentWindow?.document.readyState === "complete") setTimeout(run, 150);
  else iframe.onload = () => setTimeout(run, 150);
}
