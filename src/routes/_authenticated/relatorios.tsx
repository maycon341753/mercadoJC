import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, TrendingUp, Package, Users, Wallet } from "lucide-react";
import { brl, dateFmt, dateTimeFmt, nfmt } from "@/lib/format";
import { exportPDF, exportExcel } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Mercado JC ERP" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); toast.success("Relatório gerado"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const rangeISO = { start: `${from}T00:00:00`, end: `${to}T23:59:59` };
  const subtitle = `Período: ${dateFmt(from)} — ${dateFmt(to)}`;

  const reports = [
    {
      id: "vendas",
      title: "Vendas",
      icon: TrendingUp,
      desc: "Todas as vendas do período com totais e forma de pagamento",
      pdf: () => run("vendas-pdf", async () => {
        const { data, error } = await supabase.from("sales")
          .select("sale_number, total, subtotal, discount, payment_method, status, created_at, customer:customers(name)")
          .gte("created_at", rangeISO.start).lte("created_at", rangeISO.end)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []).map((s) => [
          `#${s.sale_number}`, dateTimeFmt(s.created_at), s.customer?.name ?? "Consumidor",
          s.payment_method, s.status, brl(Number(s.total)),
        ]);
        const total = (data ?? []).reduce((a, s) => a + Number(s.total), 0);
        exportPDF({ title: "Relatório de Vendas", subtitle: `${subtitle} • Total ${brl(total)}`,
          columns: ["#", "Data", "Cliente", "Pagto", "Status", "Total"], rows, filename: `vendas-${from}-${to}` });
      }),
      xlsx: () => run("vendas-xlsx", async () => {
        const { data, error } = await supabase.from("sales")
          .select("sale_number, total, subtotal, discount, payment_method, status, created_at, customer:customers(name)")
          .gte("created_at", rangeISO.start).lte("created_at", rangeISO.end);
        if (error) throw error;
        exportExcel((data ?? []).map((s) => ({
          Numero: s.sale_number, Data: dateTimeFmt(s.created_at),
          Cliente: s.customer?.name ?? "Consumidor",
          Subtotal: Number(s.subtotal), Desconto: Number(s.discount), Total: Number(s.total),
          Pagamento: s.payment_method, Status: s.status,
        })), `vendas-${from}-${to}`, "Vendas");
      }),
    },
    {
      id: "produtos",
      title: "Produtos e estoque",
      icon: Package,
      desc: "Inventário atual com preços e estoque",
      pdf: () => run("produtos-pdf", async () => {
        const { data, error } = await supabase.from("products")
          .select("sku, name, unit, cost_price, sale_price, stock, stock_min, category:categories(name)")
          .eq("active", true).order("name");
        if (error) throw error;
        exportPDF({ title: "Inventário de Produtos", subtitle: `Gerado em ${dateFmt(today)}`,
          columns: ["SKU", "Nome", "Categoria", "Un.", "Custo", "Venda", "Estoque"],
          rows: (data ?? []).map((p) => [
            p.sku ?? "-", p.name, p.category?.name ?? "-", p.unit,
            brl(Number(p.cost_price ?? 0)), brl(Number(p.sale_price)), nfmt(Number(p.stock)),
          ]),
          filename: `produtos-${today}` });
      }),
      xlsx: () => run("produtos-xlsx", async () => {
        const { data, error } = await supabase.from("products")
          .select("sku, barcode, name, unit, cost_price, sale_price, promo_price, stock, stock_min, active, category:categories(name)")
          .order("name");
        if (error) throw error;
        exportExcel((data ?? []).map((p) => ({
          SKU: p.sku, Codigo_Barras: p.barcode, Nome: p.name, Categoria: p.category?.name ?? "",
          Unidade: p.unit, Custo: Number(p.cost_price ?? 0), Venda: Number(p.sale_price),
          Promo: p.promo_price ? Number(p.promo_price) : "", Estoque: Number(p.stock),
          Estoque_Min: Number(p.stock_min), Ativo: p.active ? "Sim" : "Não",
        })), `produtos-${today}`, "Produtos");
      }),
    },
    {
      id: "clientes",
      title: "Clientes",
      icon: Users,
      desc: "Base completa de clientes cadastrados",
      pdf: () => run("clientes-pdf", async () => {
        const { data, error } = await supabase.from("customers")
          .select("name, email, phone, city, state, cpf_cnpj").order("name");
        if (error) throw error;
        exportPDF({ title: "Clientes", subtitle: `Gerado em ${dateFmt(today)}`,
          columns: ["Nome", "CPF/CNPJ", "Email", "Telefone", "Cidade/UF"],
          rows: (data ?? []).map((c) => [
            c.name, c.cpf_cnpj ?? "-", c.email ?? "-", c.phone ?? "-",
            [c.city, c.state].filter(Boolean).join("/") || "-",
          ]),
          filename: `clientes-${today}` });
      }),
      xlsx: () => run("clientes-xlsx", async () => {
        const { data, error } = await supabase.from("customers").select("*").order("name");
        if (error) throw error;
        exportExcel(data ?? [], `clientes-${today}`, "Clientes");
      }),
    },
    {
      id: "financeiro",
      title: "Financeiro",
      icon: Wallet,
      desc: "Receitas, despesas e fluxo de caixa do período",
      pdf: () => run("financeiro-pdf", async () => {
        const { data, error } = await supabase.from("financial_entries")
          .select("*").gte("created_at", rangeISO.start).lte("created_at", rangeISO.end)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rec = (data ?? []).filter((e) => e.type === "receita").reduce((a, e) => a + Number(e.amount), 0);
        const des = (data ?? []).filter((e) => e.type === "despesa").reduce((a, e) => a + Number(e.amount), 0);
        exportPDF({ title: "Fluxo Financeiro",
          subtitle: `${subtitle} • Receitas ${brl(rec)} • Despesas ${brl(des)} • Saldo ${brl(rec - des)}`,
          columns: ["Data", "Tipo", "Categoria", "Descrição", "Status", "Valor"],
          rows: (data ?? []).map((e) => [
            dateFmt(e.created_at), e.type, e.category, e.description, e.status,
            `${e.type === "receita" ? "+" : "-"}${brl(Number(e.amount))}`,
          ]),
          filename: `financeiro-${from}-${to}` });
      }),
      xlsx: () => run("financeiro-xlsx", async () => {
        const { data, error } = await supabase.from("financial_entries")
          .select("*").gte("created_at", rangeISO.start).lte("created_at", rangeISO.end);
        if (error) throw error;
        exportExcel(data ?? [], `financeiro-${from}-${to}`, "Financeiro");
      }),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Exporte dados em PDF ou Excel</p>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Período</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground pb-2">Aplicado a Vendas e Financeiro. Produtos e Clientes exportam a base atual.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id} className="shadow-card hover:shadow-elegant transition-shadow">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <CardTitle>{r.title}</CardTitle>
                    <CardDescription>{r.desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy === `${r.id}-pdf`} onClick={r.pdf}>
                    <FileText className="size-4 mr-1" /> {busy === `${r.id}-pdf` ? "Gerando..." : "PDF"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy === `${r.id}-xlsx`} onClick={r.xlsx}>
                    <FileSpreadsheet className="size-4 mr-1" /> {busy === `${r.id}-xlsx` ? "Gerando..." : "Excel"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
