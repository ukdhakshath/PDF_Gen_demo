
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PrinterAssembly from "./components/PrinterAssembly.jsx";
import "./App.css";

const API = "http://localhost:5000/api";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

const baseTrayIds = ["paper-tray"];

export default function App() {
  const [catalogue, setCatalogue] = useState({ printers: [], accessories: [] });
  const [printerId, setPrinterId] = useState("");
  const [printerQuantity, setPrinterQuantity] = useState(1);
  const [selected, setSelected] = useState({});
  const [customer, setCustomer] = useState({ name: "", email: "", company: "" });
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Holds the latest PNG data URL captured from the assembly stage.
  const configImageRef = useRef(null);

  // Called by PrinterAssembly whenever the visual changes.
  const handleCapture = useCallback((dataURL) => {
    configImageRef.current = dataURL;
  }, []);

  useEffect(() => {
    fetch(`${API}/catalogue`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load catalogue.");
        return r.json();
      })
      .then((data) => {
        setCatalogue(data);
        setPrinterId(data.printers[0]?.id || "");
      })
      .catch(() => setError("Start the backend on port 5000."))
      .finally(() => setLoading(false));
  }, []);

  const printer = catalogue.printers.find((p) => p.id === printerId);

  const hasBaseTray = baseTrayIds.some((id) => Number(selected[id] || 0) > 0);

  function toggleAccessory(id, checked) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[id] = 1;
      } else {
        delete next[id];
      }
      // Remove dependent accessories when all trays are removed.
      const trayStillSelected = baseTrayIds.some(
        (tid) => Number(next[tid] || 0) > 0
      );
      if (!trayStillSelected) {
        delete next.finisher;
      }
      return next;
    });
  }

  const quotation = useMemo(() => {
    const items = [];
    if (printer) {
      items.push({
        ...printer,
        quantity: Number(printerQuantity),
        amount: printer.price * Number(printerQuantity)
      });
    }
    for (const acc of catalogue.accessories) {
      const qty = selected[acc.id] ? 1 : 0;
      if (qty > 0) {
        items.push({ ...acc, quantity: qty, amount: acc.price * qty });
      }
    }
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const discountAmount = subtotal * Number(discount) / 100;
    const tax = (subtotal - discountAmount) * 0.18;
    return { items, subtotal, discountAmount, tax, total: subtotal - discountAmount + tax };
  }, [catalogue, printer, printerQuantity, selected, discount]);

  function changeCustomer(e) {
    setCustomer((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function generatePDF(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setGenerating(true);

    try {
      const configurationImage = configImageRef.current;

      const response = await fetch(`${API}/quotations/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerId,
          printerQuantity: Number(printerQuantity),
          accessories: Object.keys(selected).map((id) => ({
            id,
            quantity: 1
          })),
          discountPercent: Number(discount),
          customer,
          configurationImage
        })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "PDF generation failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sharp-quotation-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess("Quotation PDF downloaded successfully.");
    } catch (err) {
      setError(err.message || "Could not generate PDF.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <main className="loading">Loading catalogue…</main>;

  return (
    <div className="app-shell">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="topbar">
        <a className="brand" href="#home">SHARP<span>.</span></a>
        <nav>
          <a href="#catalogue">Products</a>
          <a href="#configurator">Configurator</a>
          <a href="#quotation">Quotation</a>
        </nav>
      </header>

      <main id="home" className="container">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="hero">
          <div>
            <p className="eyebrow">DIGITAL PRODUCT CATALOGUE</p>
            <h1>Configure your<br />printer setup.</h1>
            <p className="hero-description">
              Select a Sharp printer, mount compatible accessories and generate
              a professional quotation with your exact configuration.
            </p>
            <a className="primary-link" href="#catalogue">Explore printers →</a>
          </div>
          <div className="hero-mark" aria-hidden="true"><span>S</span></div>
        </section>

        {/* ── Product catalogue ─────────────────────────────────────── */}
        <section id="catalogue" className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / PRODUCTS</p>
              <h2>Select your printer</h2>
            </div>
            <span className="demo-tag">Sample prices</span>
          </div>

          <div className="product-grid">
            {catalogue.printers.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`product-card ${printerId === item.id ? "selected" : ""}`}
                onClick={() => { setPrinterId(item.id); setSelected({}); }}
                aria-pressed={printerId === item.id}
              >
                <div className="product-visual">
                  <img
                    className="product-image"
                    src={item.image}
                    alt={item.name}
                    onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }}
                  />
                  {printerId === item.id && (
                    <span className="selected-tag">Selected</span>
                  )}
                </div>
                <div className="product-info">
                  <span className="product-category">{item.category}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="product-bottom">
                    <strong>{money(item.price)}</strong>
                    <span className="choose-label">
                      {printerId === item.id ? "✓ Selected" : "Choose →"}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Configurator ─────────────────────────────────────────── */}
        {printer && (
          <section id="configurator" className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / CONFIGURATION</p>
                <h2>Build your configuration</h2>
              </div>
              <span className="demo-tag">{printer.name}</span>
            </div>

            <div className="configurator-layout">
              {/* Assembly preview */}
              <div className="assembly-panel">
                <p className="panel-caption">LIVE 2D ASSEMBLY</p>
                <PrinterAssembly
                  baseImage={printer.image}
                  baseName={printer.name}
                  paperTray={Boolean(selected["paper-tray"])}
                  finisher={Boolean(selected.finisher)}
                  onCapture={handleCapture}
                />
                <p className="assembly-help">
                  Hover an accessory label to identify it · Add components using the panel on the right.
                </p>
              </div>

              {/* Accessory options */}
              <div className="options-panel">
                <div className="option-heading">
                  <h3>Available components</h3>
                  <span>{Object.keys(selected).length} selected</span>
                </div>

                {catalogue.accessories.map((item) => {
                  const checked = Boolean(selected[item.id]);
                  const requiresTray = item.id === "finisher";
                  const disabled = requiresTray && !hasBaseTray;

                  return (
                    <div className="config-option" key={item.id}>
                      <label className="config-option-main">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(ev) => toggleAccessory(item.id, ev.target.checked)}
                        />
                        <img src={item.image} alt="" />
                        <span>
                          <strong>{item.name}</strong>
                          <small>{money(item.price)}</small>
                        </span>
                      </label>

                      {disabled && (
                        <p className="option-hint">Select a paper tray first.</p>
                      )}
                    </div>
                  );
                })}

                <label className="printer-qty">
                  Printer quantity
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={printerQuantity}
                    onChange={(ev) => {
                      const v = Number(ev.target.value);
                      if (Number.isInteger(v) && v >= 1 && v <= 100) setPrinterQuantity(v);
                    }}
                  />
                </label>

                <div className="config-total">
                  <span>Estimated total before tax</span>
                  <strong>{money(quotation.subtotal)}</strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Quotation ─────────────────────────────────────────────── */}
        <section id="quotation" className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / QUOTATION</p>
              <h2>Generate your PDF</h2>
            </div>
            <span className="demo-tag">18% illustrative tax · max 30% discount</span>
          </div>

          <div className="quotation-layout">
            {/* Customer form */}
            <form className="customer-panel" onSubmit={generatePDF}>
              <h3>Customer details</h3>

              <label htmlFor="customer-name">
                Name *
                <input
                  id="customer-name"
                  name="name"
                  type="text"
                  value={customer.name}
                  onChange={changeCustomer}
                  maxLength="100"
                  required
                />
              </label>

              <label htmlFor="customer-email">
                Email *
                <input
                  id="customer-email"
                  name="email"
                  type="email"
                  value={customer.email}
                  onChange={changeCustomer}
                  maxLength="150"
                  required
                />
              </label>

              <label htmlFor="customer-company">
                Company
                <input
                  id="customer-company"
                  name="company"
                  type="text"
                  value={customer.company}
                  onChange={changeCustomer}
                  maxLength="150"
                />
              </label>

              <label htmlFor="discount">
                Discount (0–30%)
                <input
                  id="discount"
                  type="number"
                  min="0"
                  max="30"
                  value={discount}
                  onChange={(ev) => {
                    const v = Number(ev.target.value);
                    if (v >= 0 && v <= 30) setDiscount(v);
                  }}
                />
              </label>

              <button className="generate-button" disabled={generating}>
                {generating ? "Generating…" : "Download quotation PDF ↓"}
              </button>

              {error && <p className="message error">{error}</p>}
              {success && <p className="message success">{success}</p>}
            </form>

            {/* Summary panel */}
            <div className="summary-panel">
              <h3>Quotation summary</h3>

              {quotation.items.length === 0 ? (
                <p className="summary-empty">Select a printer to see the quotation.</p>
              ) : (
                quotation.items.map((item) => (
                  <div className="summary-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.quantity} × {money(item.price)}</small>
                    </div>
                    <span>{money(item.amount)}</span>
                  </div>
                ))
              )}

              <div className="summary-calculations">
                <div><span>Subtotal</span><span>{money(quotation.subtotal)}</span></div>
                <div><span>Discount</span><span>− {money(quotation.discountAmount)}</span></div>
                <div><span>Tax (18%)</span><span>{money(quotation.tax)}</span></div>
              </div>

              <div className="grand-total">
                <div>
                  <span>Grand total</span>
                  <small>Including illustrative tax</small>
                </div>
                <strong>{money(quotation.total)}</strong>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <a className="brand" href="#home">SHARP<span>.</span></a>
          <p>Digital Product Catalogue · Demo quotation</p>
        </footer>
      </main>
    </div>
  );
}
