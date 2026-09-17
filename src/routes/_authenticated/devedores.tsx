import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, HandCoins, AlertTriangle, Wallet } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";

type Debt = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  description: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/devedores")({
  head: () => ({
    meta: [
      { title: "Devedores — Mercado JC ERP" },
      { name: "description", content: "Controle de fiado: clientes que levam itens para pagar depois, com saldo devedor e baixas de pagamento." },
      { property: "og:title", content: "Devedores — Mercado JC ERP" },
      { property: "og:description", content: "Controle de fiado e saldo devedor dos clientes do Mercado JC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DevedoresPage,
});

const empty = { customer_id: "", customer_name: "", description: "", amount: 0, due_date: "", notes: "" };

function DevedoresPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const { data: debts = [], isLoading } = useQuery({
    queryKey: ["debts", search],
    queryFn: async () => {
      let q = supabase.from("debts").select("*").order("created_at", { ascending: false }).limit(300);
      if (search.trim()) q = q.ilike("customer_name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Debt[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name").limit(500);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("debts").insert({
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        description: form.description || null,
        amount: form.amount,
        due_date: form.due_date || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dívida registrada");
      setOpen(false); setForm(empty);
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const { error } = await supabase.from("debt_payments").insert({ debt_id: payFor.id, amount: payAmount });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado");
      setPayFor(null); setPayAmount(0);
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao registrar pagamento"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Registro excluído"); qc.invalidateQueries({ queryKey: ["debts"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const saldo = (d: Debt) => Math.max(0, Number(d.amount) - Number(d.paid_amount));
  const totalAberto = debts.reduce((s, d) => s + saldo(d), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = debts.filter((d) => saldo(d) > 0 && d.due_date && d.due_date < hoje);
  const devedoresUnicos = new Set(debts.filter((d) => saldo(d) > 0).map((d) => d.customer_name)).size;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Devedores</h1>
          <p className="text-sm text-muted-foreground">Controle de fiado — clientes que pagam depois</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-elegant"><Plus className="size-4 mr-2" /> Nova dívida</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar dívida</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Cliente cadastrado</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => {
                    const c = customers.find((x) => x.id === v);
                    setForm((f) => ({ ...f, customer_id: v, customer_name: c?.name ?? f.customer_name }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Nome do devedor *</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Descrição dos itens</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: 2 pães, 1 leite" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Observações</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={!form.customer_name || form.amount <= 0 || save.isPending}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Wallet className="size-4" /> Total em aberto</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">{brl(totalAberto)}</p></CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><HandCoins className="size-4" /> Devedores</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{devedoresUnicos}</p></CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle className="size-4" /> Vencidos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{vencidos.length}</p></CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar devedor..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Devedor</TableHead>
                <TableHead className="hidden md:table-cell">Itens</TableHead>
                <TableHead className="hidden sm:table-cell">Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && debts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma dívida registrada</TableCell></TableRow>}
              {debts.map((d) => {
                const s = saldo(d);
                const venceu = s > 0 && d.due_date && d.due_date < hoje;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.customer_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{d.description ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {d.due_date ? new Date(d.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">{brl(d.amount)}</TableCell>
                    <TableCell className="text-right">
                      {s === 0
                        ? <Badge variant="secondary">Pago</Badge>
                        : <Badge variant={venceu ? "destructive" : "outline"}>{brl(s)}</Badge>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" disabled={s === 0} onClick={() => { setPayFor(d); setPayAmount(s); }} title="Registrar pagamento">
                        <HandCoins className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm(`Excluir dívida de ${d.customer_name}?`)) del.mutate(d.id); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!payFor} onOpenChange={(v) => { if (!v) { setPayFor(null); setPayAmount(0); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receber de {payFor?.customer_name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Valor recebido</Label>
            <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} />
            {payFor && <p className="text-xs text-muted-foreground">Saldo devedor: {brl(saldo(payFor))}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancelar</Button>
            <Button onClick={() => pay.mutate()} disabled={payAmount <= 0 || pay.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
