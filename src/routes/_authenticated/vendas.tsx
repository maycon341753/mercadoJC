import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { brl, dateTimeFmt } from "@/lib/format";
import { Ban, Receipt, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas — Mercado JC ERP" },
      { name: "description", content: "Histórico de vendas e cancelamento de transações do Mercado JC ERP" },
      { property: "og:title", content: "Vendas — Mercado JC ERP" },
      { property: "og:description", content: "Histórico de vendas e cancelamento de transações" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendasPage,
});

const payLabels: Record<string, string> = {
  dinheiro: "💵 Dinheiro", pix: "📱 PIX", credito: "💳 Crédito", debito: "💳 Débito", vale: "🎫 Vale",
};

function VendasPage() {
  const [search, setSearch] = useState("");
  const [toCancel, setToCancel] = useState<{ id: string; sale_number: number; created_at: string } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const queryClient = useQueryClient();

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

  const CANCEL_DEADLINE_DAYS = 7;

  const isPastDeadline = (createdAt: string) =>
    Date.now() - new Date(createdAt).getTime() > CANCEL_DEADLINE_DAYS * 24 * 60 * 60 * 1000;

  const requestCancel = (s: { id: string; sale_number: number; created_at: string }) => {
    if (isPastDeadline(s.created_at)) {
      toast.error(`Não é possível cancelar a venda #${s.sale_number}: o prazo de ${CANCEL_DEADLINE_DAYS} dias já passou.`);
      return;
    }
    setToCancel(s);
  };

  const confirmCancel = async () => {
    if (!toCancel) return;
    if (isPastDeadline(toCancel.created_at)) {
      toast.error(`Não é possível cancelar: o prazo de ${CANCEL_DEADLINE_DAYS} dias já passou.`);
      setToCancel(null);
      return;
    }
    setCanceling(true);
    try {
      const { data: items, error: itemsError } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", toCancel.id);
      if (itemsError) throw itemsError;

      // Devolve os itens ao estoque
      const movements = (items ?? [])
        .filter((i) => i.product_id)
        .map((i) => ({
          product_id: i.product_id as string,
          type: "entrada" as const,
          quantity: i.quantity,
          reason: `Estorno venda #${toCancel.sale_number}`,
        }));
      if (movements.length > 0) {
        const { error: mvError } = await supabase.from("stock_movements").insert(movements);
        if (mvError) throw mvError;
      }

      // Remove a receita gerada automaticamente no Financeiro
      const { error: finError } = await supabase
        .from("financial_entries")
        .delete()
        .eq("sale_id", toCancel.id);
      if (finError) throw finError;

      // Marca a venda como cancelada
      const { error: saleError } = await supabase
        .from("sales")
        .update({ status: "cancelada" })
        .eq("id", toCancel.id);
      if (saleError) throw saleError;

      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      await queryClient.invalidateQueries({ queryKey: ["financial-entries"] });
      toast.success(`Venda #${toCancel.sale_number} cancelada. Estoque devolvido.`);
      setToCancel(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar a venda.");
    } finally {
      setCanceling(false);
    }
  };

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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma venda</TableCell></TableRow>}
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
                  <TableCell className="text-right">
                    {s.status === "concluida" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => requestCancel({ id: s.id, sale_number: s.sale_number, created_at: s.created_at })}
                      >
                        <Ban className="size-4" /> Cancelar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toCancel} onOpenChange={(open) => !open && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda #{toCancel?.sale_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              A venda será marcada como cancelada, os itens voltarão para o estoque e a receita correspondente será removida do Financeiro. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={canceling}
              onClick={(e) => { e.preventDefault(); confirmCancel(); }}
            >
              {canceling ? "Cancelando..." : "Cancelar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
