import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, dateFmt } from "@/lib/format";
import { Plus, TrendingUp, TrendingDown, Wallet, FileDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { exportPDF, exportExcel } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Mercado JC ERP" }] }),
  component: FinanceiroPage,
});

const CATEGORIAS = ["Vendas", "Fornecedores", "Aluguel", "Salários", "Energia", "Água", "Marketing", "Manutenção", "Outros"];

function FinanceiroPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [category, setCategory] = useState("Outros");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["financial_entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_entries")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = entries.reduce(
    (acc, e) => {
      const v = Number(e.amount);
      if (e.type === "receita") acc.receitas += v;
      else acc.despesas += v;
      if (e.status === "pendente") acc.pendente += e.type === "receita" ? v : -v;
      return acc;
    },
    { receitas: 0, despesas: 0, pendente: 0 },
  );
  const saldo = totals.receitas - totals.despesas;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("financial_entries").insert({
        type, category, description,
        amount: Number(amount),
        due_date: dueDate || null,
        notes: notes || null,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento criado");
      setOpen(false); setDescription(""); setAmount(""); setDueDate(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["financial_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = useMutation({
    mutationFn: async (row: { id: string; status: string }) => {
      const newStatus = row.status === "pago" ? "pendente" : "pago";
      const { error } = await supabase.from("financial_entries")
        .update({ status: newStatus, paid_at: newStatus === "pago" ? new Date().toISOString() : null })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_entries"] }),
  });

  const doExportPDF = () => {
    exportPDF({
      title: "Relatório Financeiro",
      subtitle: `Saldo: ${brl(saldo)} • Receitas ${brl(totals.receitas)} • Despesas ${brl(totals.despesas)}`,
      columns: ["Data", "Tipo", "Categoria", "Descrição", "Valor", "Status"],
      rows: entries.map((e) => [
        dateFmt(e.created_at),
        e.type,
        e.category,
        e.description,
        brl(Number(e.amount)),
        e.status,
      ]),
      filename: `financeiro-${new Date().toISOString().slice(0, 10)}`,
    });
  };
  const doExportXLSX = () => {
    exportExcel(entries.map((e) => ({
      Data: dateFmt(e.created_at),
      Tipo: e.type,
      Categoria: e.category,
      Descrição: e.description,
      Valor: Number(e.amount),
      Status: e.status,
      Vencimento: e.due_date ?? "",
    })), `financeiro-${new Date().toISOString().slice(0, 10)}`, "Financeiro");
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Receitas, despesas e fluxo de caixa</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doExportPDF}><FileDown className="size-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={doExportXLSX}><FileDown className="size-4 mr-1" /> Excel</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" /> Novo lançamento</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo lançamento financeiro</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={type} onValueChange={(v) => setType(v as "receita" | "despesa")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="despesa">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Compra de mercadorias" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Vencimento</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button disabled={!description || !amount || create.isPending} onClick={() => create.mutate()}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-card"><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Receitas</p><p className="text-xl font-bold text-success">{brl(totals.receitas)}</p></div>
          <TrendingUp className="size-8 text-success/50" />
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Despesas</p><p className="text-xl font-bold text-destructive">{brl(totals.despesas)}</p></div>
          <TrendingDown className="size-8 text-destructive/50" />
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Saldo</p><p className={`text-xl font-bold ${saldo >= 0 ? "text-primary" : "text-destructive"}`}>{brl(saldo)}</p></div>
          <Wallet className="size-8 text-primary/50" />
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Pendente</p><p className="text-xl font-bold text-warning">{brl(totals.pendente)}</p></div>
          <Wallet className="size-8 text-warning/50" />
        </CardContent></Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Lançamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum lançamento</TableCell></TableRow>}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{dateFmt(e.created_at)}</TableCell>
                  <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "pago" ? "default" : e.status === "cancelado" ? "destructive" : "secondary"}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold ${e.type === "receita" ? "text-success" : "text-destructive"}`}>
                    {e.type === "receita" ? "+" : "-"}{brl(Number(e.amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => togglePaid.mutate({ id: e.id, status: e.status })} aria-label="Alternar status">
                      {e.status === "pago" ? <X className="size-4" /> : <Check className="size-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
