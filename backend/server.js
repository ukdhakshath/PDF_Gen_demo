import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printers, accessories } from "./data/catalogue.js";

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.use(express.json({ limit: "12mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Quotation API is running"
  });
});

// Return printer and accessory catalogue
app.get("/api/catalogue", (req, res) => {
  res.json({ printers, accessories });
});

// Format money in Indian Rupees
function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

// Validate and calculate quotation totals
function calculateQuotation(body = {}) {
  const {
    printerId,
    printerQuantity = 1,
    accessories: requestedAccessories = [],
    discountPercent = 0,
    customer = {}
  } = body;

  const printer = printers.find((item) => item.id === printerId);

  if (!printer) {
    throw new Error("Please select a valid printer.");
  }

  const quantity = Number(printerQuantity);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) {
    throw new Error("Printer quantity must be between 1 and 100.");
  }

  if (!Array.isArray(requestedAccessories)) {
    throw new Error("Invalid accessory selection.");
  }

  const seenIds = new Set();

  const selectedAccessories = requestedAccessories.map((item) => {
    if (!item || typeof item.id !== "string") {
      throw new Error("Invalid accessory selection.");
    }

    if (seenIds.has(item.id)) {
      throw new Error("Duplicate accessories are not allowed.");
    }

    seenIds.add(item.id);

    const accessory = accessories.find(
      (entry) => entry.id === item.id
    );

    if (!accessory) {
      throw new Error(`Invalid accessory: ${item.id}`);
    }

    // Every selected accessory has a fixed quantity of one.
    const accessoryQuantity = 1;

    return {
      ...accessory,
      quantity: accessoryQuantity,
      amount: accessory.price * accessoryQuantity
    };
  });

  // Finisher requires the large capacity paper tray.
  const selectedIds = new Set(
    selectedAccessories.map((item) => item.id)
  );

  if (
    selectedIds.has("finisher") &&
    !selectedIds.has("paper-tray")
  ) {
    throw new Error(
      "Select a paper tray before adding the finisher."
    );
  }

  const customerName = String(customer.name || "").trim();
  const customerEmail = String(customer.email || "").trim();
  const customerCompany = String(customer.company || "").trim();

  if (!customerName || !customerEmail) {
    throw new Error("Customer name and email are required.");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(customerEmail)) {
    throw new Error("Enter a valid customer email.");
  }

  const discount = Number(discountPercent);

  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 30
  ) {
    throw new Error("Discount must be between 0% and 30%.");
  }

  const printerAmount = printer.price * quantity;

  const accessoriesAmount = selectedAccessories.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const subtotal = printerAmount + accessoriesAmount;

  const discountAmount = Math.round(
    subtotal * (discount / 100)
  );

  const taxableAmount = subtotal - discountAmount;
  const tax = Math.round(taxableAmount * 0.18);
  const total = taxableAmount + tax;

  return {
    customer: {
      name: customerName,
      email: customerEmail,
      company: customerCompany
    },
    printer: {
      ...printer,
      quantity,
      amount: printerAmount
    },
    accessories: selectedAccessories,
    discountPercent: discount,
    subtotal,
    discountAmount,
    taxableAmount,
    tax,
    total
  };
}

// Live quotation preview
app.post("/api/quotations/preview", (req, res) => {
  try {
    const quotation = calculateQuotation(req.body);

    res.json({
      success: true,
      quotation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Unable to calculate quotation."
    });
  }
});

// Escape user-provided text before inserting it into HTML
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

// Validate the configuration screenshot sent by the frontend
function validateConfigurationImage(imageData) {
  if (typeof imageData !== "string") {
    throw new Error(
      "Configuration image is missing. Capture the printer preview before generating the PDF."
    );
  }

  const prefix = "data:image/png;base64,";

  if (!imageData.startsWith(prefix)) {
    throw new Error(
      "The configuration image must be a PNG data URL."
    );
  }

  const base64 = imageData.slice(prefix.length);

  if (
    !base64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    base64.length % 4 !== 0
  ) {
    throw new Error("Invalid PNG image data.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (
    buffer.length < 8 ||
    buffer.length > 8 * 1024 * 1024 ||
    buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  ) {
    throw new Error("Invalid or oversized PNG image.");
  }

  return imageData;
}

// Generate a PDF quotation
app.post("/api/quotations/pdf", async (req, res) => {
  let browser;

  try {
    const quotation = calculateQuotation(req.body);

    const configurationImage = validateConfigurationImage(
      req.body.configurationImage
    );

    const templatePath = path.join(
      __dirname,
      "templates",
      "quotation.html"
    );

    let html = await readFile(templatePath, "utf8");

    const productRows = [
      {
        name: quotation.printer.name,
        quantity: quotation.printer.quantity,
        price: quotation.printer.price,
        amount: quotation.printer.amount
      },
      ...quotation.accessories.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        amount: item.amount
      }))
    ];

    const rows = productRows
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td class="number">${item.quantity}</td>
            <td class="number">${formatMoney(item.price)}</td>
            <td class="number">${formatMoney(item.amount)}</td>
          </tr>
        `
      )
      .join("");

    const replacements = {
      "{{CUSTOMER_NAME}}": escapeHtml(quotation.customer.name),
      "{{CUSTOMER_EMAIL}}": escapeHtml(quotation.customer.email),
      "{{CUSTOMER_COMPANY}}": escapeHtml(
        quotation.customer.company || "—"
      ),
      "{{PRINTER_NAME}}": escapeHtml(quotation.printer.name),
      "{{PRODUCT_ROWS}}": rows,
      "{{SUBTOTAL}}": formatMoney(quotation.subtotal),
      "{{DISCOUNT_PERCENT}}": String(quotation.discountPercent),
      "{{DISCOUNT_AMOUNT}}": formatMoney(quotation.discountAmount),
      "{{TAXABLE_AMOUNT}}": formatMoney(quotation.taxableAmount),
      "{{TAX}}": formatMoney(quotation.tax),
      "{{TOTAL}}": formatMoney(quotation.total),
      "{{CONFIGURATION_IMAGE}}": configurationImage,
      "{{DATE}}": new Date().toLocaleDateString("en-IN")
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.replaceAll(placeholder, value);
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "load"
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "16mm",
        bottom: "16mm",
        left: "14mm",
        right: "14mm"
      }
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sharp-quotation.pdf"'
    );

    res.send(Buffer.from(pdf));
  } catch (error) {
    console.error("Quotation PDF error:", error);

    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        message: error.message || "Unable to generate quotation."
      });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});