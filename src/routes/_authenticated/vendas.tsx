import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { brl, dateTimeFmt } from "@/lib/format";
import { Receipt, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Mercado JC ERP" }] }),
  component: VendasPage,
});

const payLabels: Record<string, string> = {
  dinheiro: "💵 Dinheiro", pix: "📱 PIX", credito: "💳 Crédito", debito: "💳 Débito", vale: "🎫 Vale",
};

function VendasPage() {
  const [search, setSearch] = useState("");
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", search],
    queryFn: async () => {
      let q = supabase.from("sales")
        .select("id, sale_number, total, subtotal, discount, payment_method, status, created_at, customer:customers(name)")
        .order("created_at", { ascending: false }).limit(100);
      if (search.trim()) q = q.eq("sale_number", Number(search) || -1);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Vendas</h1>
        <p className="text-sm text-muted-foreground">Histórico das últimas vendas</p>
      </div>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar por número..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma venda</TableCell></TableRow>}
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Receipt className="size-4" />
                      </div>
                      <span className="font-mono font-bold">#{s.sale_number}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{dateTimeFmt(s.created_at)}</TableCell>
                  <TableCell className="text-sm">{s.customer?.name ?? "Consumidor"}</TableCell>
                  <TableCell className="text-sm">{payLabels[s.payment_method] ?? s.payment_method}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "concluida" ? "default" : s.status === "cancelada" ? "destructive" : "secondary"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{brl(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
