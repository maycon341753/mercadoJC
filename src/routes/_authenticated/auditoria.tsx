import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateTimeFmt } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Mercado JC ERP" }] }),
  component: AuditoriaPage,
});

const ACTION_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

function AuditoriaPage() {
  const [table, setTable] = useState<string>("all");

  const { data: logs = [] } = useQuery({
    queryKey: ["audit_logs", table],
    queryFn: async () => {
      let q = supabase.from("audit_logs")
        .select("id, table_name, record_id, action, new_data, old_data, created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (table !== "all") q = q.eq("table_name", table);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" /> Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">Registro completo de alterações no sistema</p>
        </div>
        <Select value={table} onValueChange={setTable}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tabelas</SelectItem>
            <SelectItem value="products">Produtos</SelectItem>
            <SelectItem value="sales">Vendas</SelectItem>
            <SelectItem value="customers">Clientes</SelectItem>
            <SelectItem value="financial_entries">Financeiro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Últimos 200 eventos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data / hora</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Resumo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem eventos</TableCell></TableRow>}
              {logs.map((l) => {
                const summary = summarize(l.new_data ?? l.old_data);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm font-mono">{dateTimeFmt(l.created_at)}</TableCell>
                    <TableCell><Badge variant="outline">{l.table_name}</Badge></TableCell>
                    <TableCell><Badge variant={ACTION_TONE[l.action] ?? "outline"}>{l.action}</Badge></TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{l.record_id?.slice(0, 8)}…</TableCell>
                    <TableCell className="text-sm max-w-md truncate">{summary}</TableCell>
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

function summarize(data: unknown): string {
  if (!data || typeof data !== "object") return "-";
  const d = data as Record<string, unknown>;
  const keys = ["name", "sale_number", "description", "total", "email"];
  for (const k of keys) if (d[k]) return `${k}: ${String(d[k])}`;
  return Object.keys(d).slice(0, 3).map((k) => `${k}=${String(d[k]).slice(0, 20)}`).join(", ");
}
