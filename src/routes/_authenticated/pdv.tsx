import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Minus, ShoppingCart, Search, X, Check, Package, Printer } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Product = {
  id: string; name: string; sku: string | null; barcode: string | null;
  sale_price: number; promo_price: number | null; stock: number; unit: string;
  image_url: string | null;
};
type CartItem = { product: Product; qty: number };

export const Route = createFileRoute("/_authenticated/pdv")({
  head: () => ({ meta: [{ title: "PDV — Mercado JC ERP" }] }),
  component: PDV,
});

function PDV() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<"dinheiro" | "pix" | "credito" | "debito" | "vale">("dinheiro");
  const [discount, setDiscount] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [received, setReceived] = useState(0);
  const [receivedDisplay, setReceivedDisplay] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [lastScanned, setLastScanned] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products-pdv", search],
    queryFn: async () => {
      let q = supabase.from("products").select("id, name, sku, barcode, sale_price, promo_price, stock, unit, image_url").eq("active", true).limit(30);
      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.eq.${search}`);
      }
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  useEffect(() => { searchRef.current?.focus(); }, []);

  const addToCart = (p: Product) => {
    setLastScanned(p);
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { product: p, qty: 1 }];
    });
    setSearch("");
    searchRef.current?.focus();
  };

  const setQty = (id: string, qty: number) => {
    setCart((c) => c.map((x) => x.product.id === id ? { ...x, qty: Math.max(1, qty) } : x));
  };
  const removeItem = (id: string) => setCart((c) => c.filter((x) => x.product.id !== id));

  const price = (p: Product) => Number(p.promo_price ?? p.sale_price);
  const subtotal = cart.reduce((s, x) => s + price(x.product) * x.qty, 0);
  const total = Math.max(0, subtotal - discount);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && products.length > 0) {
      e.preventDefault();
      addToCart(products[0]);
    }
  };

  const finalize = async () => {
    if (cart.length === 0) { toast.error("Adicione produtos ao carrinho"); return; }
    setFinalizing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: sale, error: se } = await supabase.from("sales").insert({
        cashier_id: userData.user!.id,
        subtotal, discount, total, payment_method: payment,
      }).select("id, sale_number").single();
      if (se) throw se;

      const items = cart.map((x) => ({
        sale_id: sale.id,
        product_id: x.product.id,
        product_name: x.product.name,
        quantity: x.qty,
        unit_price: price(x.product),
        discount: 0,
        total: price(x.product) * x.qty,
      }));
      const { error: ie } = await supabase.from("sale_items").insert(items);
      if (ie) throw ie;

      const receipt: ReceiptData = {
        saleNumber: sale.sale_number,
        items: cart.map((x) => ({
          name: x.product.name,
          qty: x.qty,
          unit_price: price(x.product),
          total: price(x.product) * x.qty,
        })),
        subtotal,
        discount,
        total,
        payment,
        ...(payment === "dinheiro" && received > 0
          ? { received, change: Math.max(0, received - total) }
          : {}),
        date: new Date(),
      };
      setLastReceipt(receipt);
      if (autoPrint) printReceipt(receipt);

      toast.success(`Venda #${sale.sale_number} finalizada — ${brl(total)}`);
      clearCart();
      qc.invalidateQueries({ queryKey: ["products-pdv"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar venda");
    } finally {
      setFinalizing(false);
    }
  };

  const parseBrlInput = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    const value = Number(digits) / 100;
    return Math.max(0, Number(value.toFixed(2)));
  };

  const formatBrlInput = (amount: number): string => {
    if (!isFinite(amount) || amount <= 0) return "";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const onReceivedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseBrlInput(e.target.value);
    setReceived(value);
    setReceivedDisplay(formatBrlInput(value));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setReceived(0);
    setReceivedDisplay("");
    setPayment("dinheiro");
    setLastScanned(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5 lg:h-[calc(100vh-7rem)]">
      {/* Left: search + products */}
      <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Bipe código de barras ou digite nome/SKU..."
                className="pl-10 h-11 text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                autoFocus
              />
            </div>
          </CardContent>
        </Card>
        {lastScanned && (
          <Card className="shadow-card border-primary/40">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                {lastScanned.image_url
                  ? <img src={lastScanned.image_url} alt={lastScanned.name} className="size-full object-cover" />
                  : <Package className="size-7" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Último item bipado</p>
                <p className="font-semibold truncate">{lastScanned.name}</p>
                <p className="text-lg font-bold text-primary">{brl(price(lastScanned))}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setLastScanned(null)}><X className="size-4" /></Button>
            </CardContent>
          </Card>
        )}
        <Card className="shadow-card flex-1 min-h-0">
          <CardContent className="p-3 h-full">
            <ScrollArea className="h-full pr-2">
              <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="text-left rounded-lg border bg-card p-3 hover:border-primary hover:shadow-elegant transition group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" className="size-full object-cover" />
                          : <Package className="size-4" />}
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{p.unit}</Badge>
                    </div>
                    <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-primary">{brl(price(p))}</span>
                      <span className="text-[10px] text-muted-foreground">Est: {p.stock}</span>
                    </div>
                  </button>
                ))}
                {products.length === 0 && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                    Nenhum produto encontrado
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right: cart */}
      <Card className="lg:col-span-2 shadow-card flex flex-col min-h-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" /> Carrinho ({cart.length})
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearCart}>
                <X className="size-3 mr-1" /> Limpar
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1 min-h-[200px]">
            <div className="divide-y">
              {cart.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Carrinho vazio
                </div>
              )}
              {cart.map((x) => (
                <div key={x.product.id} className="p-3 flex items-center gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {x.product.image_url
                      ? <img src={x.product.image_url} alt={x.product.name} className="size-full object-cover" />
                      : <Package className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{x.product.name}</p>
                    <p className="text-xs text-muted-foreground">{brl(price(x.product))} × {x.qty}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="size-7" onClick={() => setQty(x.product.id, x.qty - 1)}>
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      className="w-12 h-7 text-center text-sm px-1"
                      value={x.qty}
                      onChange={(e) => setQty(x.product.id, Number(e.target.value) || 1)}
                    />
                    <Button variant="outline" size="icon" className="size-7" onClick={() => setQty(x.product.id, x.qty + 1)}>
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <div className="w-20 text-right text-sm font-bold">{brl(price(x.product) * x.qty)}</div>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeItem(x.product.id)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t p-4 space-y-3 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground flex-1">Desconto</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-24 h-8 text-right"
                value={discount || ""}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{brl(total)}</span>
            </div>
            <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                <SelectItem value="pix">📱 PIX</SelectItem>
                <SelectItem value="credito">💳 Cartão de Crédito</SelectItem>
                <SelectItem value="debito">💳 Cartão de Débito</SelectItem>
                <SelectItem value="vale">🎫 Vale</SelectItem>
              </SelectContent>
            </Select>
            {payment === "dinheiro" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground flex-1">Valor recebido</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="R$ 0,00"
                    className="w-36 h-8 text-right font-semibold tabular-nums"
                    value={receivedDisplay}
                    onChange={onReceivedChange}
                    onFocus={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      requestAnimationFrame(() => e.target.setSelectionRange(v.length, v.length));
                    }}
                  />
                </div>
                {received > 0 && (
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Troco</span>
                    <span>{brl(Math.max(0, received - total))}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="autoprint" checked={autoPrint} onCheckedChange={setAutoPrint} />
              <Label htmlFor="autoprint" className="text-sm text-muted-foreground">Imprimir cupom automaticamente</Label>
            </div>
            <Button
              className="w-full h-12 text-base font-bold bg-gradient-primary shadow-elegant"
              onClick={finalize}
              disabled={finalizing || cart.length === 0}
            >
              <Check className="size-5 mr-2" /> Finalizar Venda
            </Button>
            {lastReceipt && (
              <Button variant="outline" className="w-full" onClick={() => printReceipt(lastReceipt)}>
                <Printer className="size-4 mr-2" /> Reimprimir cupom #{lastReceipt.saleNumber}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
