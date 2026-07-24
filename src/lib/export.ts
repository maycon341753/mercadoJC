import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export function exportPDF(opts: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(opts.title, 14, 16);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(opts.subtitle, 14, 22);
  }
  doc.setFontSize(9);
  doc.setTextColor(160);
  doc.text(`Mercado JC ERP • ${new Date().toLocaleString("pt-BR")}`, 14, 28);
  autoTable(doc, {
    head: [opts.columns],
    body: opts.rows,
    startY: 34,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [16, 122, 87] },
    alternateRowStyles: { fillColor: [245, 250, 247] },
  });
  doc.save(`${opts.filename}.pdf`);
}

export function exportExcel<T extends Record<string, unknown>>(rows: T[], filename: string, sheet = "Dados") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
