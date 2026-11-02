/* ════════════════════════════════════════════════════════════════════════
   EXPORT.JS — CSV / Excel / Word / Notes(txt) / PDF export.
   Fully additive: only READS the already-rendered <table> DOM (whatever is
   currently filtered/sorted on screen) and never calls or wraps any
   function in script.js. Zero risk to existing add/edit/delete/sync logic.
   Load AFTER script.js (order vs animation.js doesn't matter).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Pull headers/rows from a table, skipping any column whose header is blank
  // (the actions/icon columns in every table are always the blank-header one).
  function getTableData(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return { headers: [], rows: [] };
    const headCells = [...table.querySelectorAll("thead th")];
    const keep = [];
    headCells.forEach((th, i) => {
      if (th.textContent.trim()) keep.push(i);
    });
    const headers = keep.map((i) =>
      headCells[i].textContent.replace(/[↑↓↕]/g, "").trim(),
    );
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) => {
      const cells = [...tr.children];
      return keep.map((i) => (cells[i] ? cells[i].textContent.trim() : ""));
    });
    return { headers, rows };
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCSV(headers, rows) {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  }

  function toHTMLTable(headers, rows, title) {
    let h = `<h3>${title}</h3><table border="1" cellpadding="4" style="border-collapse:collapse"><tr>`;
    h += headers.map((x) => `<th>${x}</th>`).join("") + "</tr>";
    rows.forEach((r) => {
      h += "<tr>" + r.map((x) => `<td>${x}</td>`).join("") + "</tr>";
    });
    return h + "</table>";
  }

  function exportPDF(headers, rows, filename, title) {
    if (!window.jspdf) {
      window.toast &&
        toast("PDF library failed to load — check connection", true);
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: rows[0] && rows[0].length > 5 ? "landscape" : "portrait",
    });
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 20,
      styles: { fontSize: 8 },
    });
    doc.save(filename);
  }

  // format: csv | xls | doc | txt | pdf
  window.exportTable = function (tableId, format, label) {
    const { headers, rows } = getTableData(tableId);
    if (rows.length === 0)
      return window.toast && toast("Nothing to export", true);
    const base = `${label}_${stamp()}`;
    closeExportMenus();
    try {
      if (format === "csv") {
        downloadBlob(toCSV(headers, rows), base + ".csv", "text/csv");
      } else if (format === "txt") {
        downloadBlob(
          [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n"),
          base + ".txt",
          "text/plain",
        );
      } else if (format === "xls") {
        downloadBlob(
          `<html><head><meta charset="UTF-8"></head><body>${toHTMLTable(headers, rows, label)}</body></html>`,
          base + ".xls",
          "application/vnd.ms-excel",
        );
      } else if (format === "doc") {
        downloadBlob(
          `<html><head><meta charset="UTF-8"></head><body>${toHTMLTable(headers, rows, label)}</body></html>`,
          base + ".doc",
          "application/msword",
        );
      } else if (format === "pdf") {
        exportPDF(headers, rows, base + ".pdf", label);
      }
      window.toast && toast(`Exported ${label} as ${format.toUpperCase()} ✓`);
    } catch (e) {
      console.error("Export error:", e);
      window.toast && toast("Export failed", true);
    }
  };

  window.toggleExportMenu = function (name) {
    document.querySelectorAll(".export-menu").forEach((m) => {
      if (m.id !== "exportMenu_" + name) m.style.display = "none";
    });
    const menu = document.getElementById("exportMenu_" + name);
    if (menu)
      menu.style.display = menu.style.display === "block" ? "none" : "block";
  };

  function closeExportMenus() {
    document
      .querySelectorAll(".export-menu")
      .forEach((m) => (m.style.display = "none"));
  }
  window.closeExportMenus = closeExportMenus;

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-wrap")) closeExportMenus();
  });
})();
