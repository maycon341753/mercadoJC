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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Package, Edit, Trash2, Upload, ScanBarcode, Loader2 } from "lucide-react";
import { brl, nfmt } from "@/lib/format";
import { toast } from "sonner";
import { uploadProductImage, lookupBarcode } from "@/lib/product-image";

type Product = {
  id: string; sku: string | null; barcode: string | null; name: string;
  sale_price: number; cost_price: number; stock: number; stock_min: number;
  unit: string; active: boolean; category_id: string | null; image_url: string | null;
};

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Mercado JC ERP" }] }),
  component: ProdutosPage,
});

const emptyForm = {
  id: "", sku: "", barcode: "", name: "", sale_price: 0, cost_price: 0,
  stock: 0, stock_min: 0, unit: "un", category_id: "", image_url: "",
};

function ProdutosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file, form.sku || form.barcode || undefined);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Imagem enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const handleBarcodeLookup = async (code: string) => {
    if (!code.trim()) { toast.error("Informe o código de barras"); return; }
    setScanning(true);
    try {
      const info = await lookupBarcode(code);
      if (!info) { toast.error("Produto não encontrado na base pública"); return; }
      setForm((f) => ({
        ...f,
        name: f.name || info.name || "",
        image_url: info.image_url || f.image_url,
      }));
      toast.success("Dados do produto localizados");
    } finally {
      setScanning(false);
    }
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: async () => {
      let q = supabase.from("products").select("*").order("name").limit(200);
      if (search.trim()) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku || null,
        barcode: form.barcode || null,
        name: form.name,
        sale_price: form.sale_price,
        cost_price: form.cost_price,
        stock: form.stock,
        stock_min: form.stock_min,
        unit: form.unit,
        category_id: form.category_id || null,
        image_url: form.image_url || null,
      };
      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Produto atualizado" : "Produto cadastrado");
      setOpen(false); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Produto excluído"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const edit = (p: Product) => {
    setForm({
      id: p.id, sku: p.sku ?? "", barcode: p.barcode ?? "", name: p.name,
      sale_price: Number(p.sale_price), cost_price: Number(p.cost_price),
      stock: Number(p.stock), stock_min: Number(p.stock_min),
      unit: p.unit, category_id: p.category_id ?? "", image_url: p.image_url ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">{products.length} produto(s) cadastrado(s)</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-elegant"><Plus className="size-4 mr-2" /> Novo produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 grid-cols-2">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Código de barras</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.barcode}
                    placeholder="Bipe o código aqui"
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleBarcodeLookup(form.barcode); } }}
                  />
                  <Button type="button" variant="outline" size="icon" disabled={scanning} onClick={() => void handleBarcodeLookup(form.barcode)} title="Buscar dados e foto pelo código">
                    {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanBarcode className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Foto do produto</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {form.image_url
                      ? <img src={form.image_url} alt={form.name || "Produto"} className="size-full object-cover" />
                      : <Package className="size-6 text-muted-foreground" />}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                      <label className="cursor-pointer">
                        {uploading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
                        Enviar imagem
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleUpload(e.target.files?.[0])} />
                      </label>
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled={scanning} onClick={() => void handleBarcodeLookup(form.barcode)}>
                      <ScanBarcode className="size-4 mr-2" /> Gerar pela bipagem
                    </Button>
                    {form.image_url && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setForm({ ...form, image_url: "" })}>
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">Unidade</SelectItem>
                    <SelectItem value="kg">Quilograma</SelectItem>
                    <SelectItem value="l">Litro</SelectItem>
                    <SelectItem value="cx">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Preço de custo</Label>
                <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço de venda *</Label>
                <Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque atual</Label>
                <Input type="number" step="0.001" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque mínimo</Label>
                <Input type="number" step="0.001" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: Number(e.target.value) })} />
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
            <Input placeholder="Buscar por nome, SKU ou código..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && products.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto</TableCell></TableRow>}
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" className="size-full object-cover" />
                          : <Package className="size-4" />}
                      </div>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.barcode ?? "—"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right font-bold">{brl(p.sale_price)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={Number(p.stock) <= Number(p.stock_min) ? "destructive" : "secondary"}>
                      {nfmt(p.stock)} {p.unit}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => edit(p)}><Edit className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm(`Excluir ${p.name}?`)) del.mutate(p.id); }}>
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
