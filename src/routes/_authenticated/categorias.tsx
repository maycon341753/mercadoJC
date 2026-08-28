import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Tag, Search } from "lucide-react";
import { toast } from "sonner";

type Category = {
  id: string; name: string; description: string | null;
  color: string; active: boolean; created_at: string;
};

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({ meta: [{ title: "Categorias — Mercado JC ERP" }] }),
  component: CategoriasPage,
});

const PRESET_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

const emptyForm = { id: "", name: "", description: "", color: "#10b981", active: true };

function CategoriasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", search],
    queryFn: async () => {
      let q = supabase.from("categories").select("*").order("name");
      if (search.trim()) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  // contagem de produtos por categoria
  const { data: counts = [] } = useQuery({
    queryKey: ["category-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("category_id")
        .not("category_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        const k = r.category_id as string;
        map[k] = (map[k] ?? 0) + 1;
      }
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        color: form.color,
        active: form.active,
      };
      if (form.id) {
        const { error } = await supabase.from("categories").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Categoria atualizada" : "Categoria cadastrada");
      setOpen(false); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["category-counts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria excluída");
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["category-counts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const edit = (c: Category) => {
    setForm({
      id: c.id, name: c.name, description: c.description ?? "",
      color: c.color ?? "#10b981", active: c.active,
    });
    setOpen(true);
  };

  const count = (id: string) => counts[id] ?? 0;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Categorias</h1>
          <p className="text-sm text-muted-foreground">{categories.length} categoria(s) cadastrada(s)</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-elegant"><Plus className="size-4 mr-2" /> Nova categoria</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Ex.: Frios, Hortifruti, Bebidas..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea placeholder="Descrição opcional do setor" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cor (identificação visual)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`size-8 rounded-full border-2 transition ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                  <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-8 w-12 p-1 cursor-pointer" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cat-active"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="size-4 rounded"
                />
                <Label htmlFor="cat-active" className="cursor-pointer">Categoria ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar categoria..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Produtos</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Tag className="size-8 opacity-40" />
                      <p>Nenhuma categoria cadastrada</p>
                      <p className="text-xs">Crie categorias como Frios, Hortifruti, Bebidas, Limpeza...</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="size-4 rounded-full" style={{ backgroundColor: c.color ?? "#10b981" }} />
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.description ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{count(c.id)}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.active ? "default" : "outline"}>{c.active ? "Ativa" : "Inativa"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => edit(c)}><Edit className="size-4" /></Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={count(c.id) > 0}
                      title={count(c.id) > 0 ? "Existem produtos vinculados" : "Excluir"}
                      onClick={() => { if (confirm(`Excluir "${c.name}"?`)) del.mutate(c.id); }}
                    >
                      <Trash2 className="size-4" />
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
