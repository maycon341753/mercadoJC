import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateTimeFmt, nfmt, brl } from "@/lib/format";
import { Plus, PackagePlus, PackageMinus, RotateCcw, TriangleAlert, FileDown } from "lucide-react";
import { toast } from "sonner";
import { exportPDF, exportExcel } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Estoque — Mercado JC ERP" }] }),
  component: EstoquePage,
});

const TYPE_META: Record<string, { label: string; icon: typeof PackagePlus; tone: string }> = {
  entrada: { label: "Entrada", icon: PackagePlus, tone: "text-success" },
  saida: { label: "Saída", icon: PackageMinus, tone: "text-destructive" },
  ajuste: { label: "Ajuste", icon: RotateCcw, tone: "text-info" },
  perda: { label: "Perda", icon: TriangleAlert, tone: "text-warning" },
};

function EstoquePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"entrada" | "saida" | "ajuste" | "perda">("entrada");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("id, type, quantity, unit_cost, reason, created_at, product:products(name, unit)")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, stock, unit").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId, type,
        quantity: Number(quantity),
        unit_cost: unitCost ? Number(unitCost) : null,
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimentação registrada");
      setOpen(false); setProductId(""); setQuantity(""); setUnitCost(""); setReason("");
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products-select"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doExportPDF = () => exportPDF({
    title: "Movimentações de Estoque",
    columns: ["Data", "Produto", "Tipo", "Quantidade", "Custo un.", "Motivo"],
    rows: movements.map((m) => [
      dateTimeFmt(m.created_at),
      m.product?.name ?? "-",
      m.type,
      nfmt(Number(m.quantity)),
      m.unit_cost ? brl(Number(m.unit_cost)) : "-",
      m.reason ?? "-",
    ]),
    filename: `estoque-${new Date().toISOString().slice(0, 10)}`,
  });

  const doExportXLSX = () => exportExcel(movements.map((m) => ({
    Data: dateTimeFmt(m.created_at),
    Produto: m.product?.name ?? "",
    Tipo: m.type,
    Quantidade: Number(m.quantity),
    "Custo unitário": m.unit_cost ? Number(m.unit_cost) : "",
    Motivo: m.reason ?? "",
  })), `estoque-${new Date().toISOString().slice(0, 10)}`, "Estoque");

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Estoque</h1>
          <p className="text-sm text-muted-foreground">Entradas, saídas, ajustes e perdas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doExportPDF}><FileDown className="size-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={doExportXLSX}><FileDown className="size-4 mr-1" /> Excel</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" /> Nova movimentação</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Movimentação de estoque</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Produto</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — estoque: {nfmt(Number(p.stock))} {p.unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                        <SelectItem value="ajuste">Ajuste (define total)</SelectItem>
                        <SelectItem value="perda">Perda / avaria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Custo unitário (opcional)</Label>
                    <Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                  </div>
                  <div>
                    <Label>Motivo</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Compra fornecedor X" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button disabled={!productId || !quantity || create.isPending} onClick={() => create.mutate()}>Registrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Últimas movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma movimentação</TableCell></TableRow>}
              {movements.map((m) => {
                const meta = TYPE_META[m.type] ?? TYPE_META.entrada;
                const Icon = meta.icon;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{dateTimeFmt(m.created_at)}</TableCell>
                    <TableCell className="font-medium text-sm">{m.product?.name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Icon className={`size-3 ${meta.tone}`} /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{nfmt(Number(m.quantity))} {m.product?.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.reason ?? "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
