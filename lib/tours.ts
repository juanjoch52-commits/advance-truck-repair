import 'driver.js/dist/driver.css';
import { driver, type DriveStep } from 'driver.js';

// Tutorial guiado (driver.js). El contenido (es/en) vive aquí, co-localizado.
// Cada paso apunta a un elemento por [data-tour="..."]; si no existe en la página,
// driver.js muestra el paso centrado (sin resaltar), así que no se rompe.

export type Lang = 'es' | 'en';
interface Step { el?: string; tEs: string; tEn: string; dEs: string; dEn: string; side?: 'top' | 'bottom' | 'left' | 'right'; }
const S = (el: string | undefined, tEs: string, tEn: string, dEs: string, dEn: string, side?: Step['side']): Step => ({ el, tEs, tEn, dEs, dEn, side });

const TOURS: Record<string, Step[]> = {
  // ─── Tour de bienvenida: el menú lateral ───
  welcome: [
    S(undefined, '¡Bienvenido! 👋', 'Welcome! 👋',
      'Este recorrido te muestra para qué sirve cada sección del sistema. Puedes repetirlo cuando quieras con el botón “?” abajo a la derecha.',
      'This tour shows what each section of the system is for. You can replay it anytime with the “?” button at the bottom-right.'),
    S('[data-tour="nav-dashboard"]', 'Panel Principal', 'Dashboard',
      'Resumen de la actividad: trabajos de la semana, totales y movimientos recientes.',
      'Activity overview: this week’s jobs, totals and recent movements.', 'right'),
    S('[data-tour="nav-ordenes"]', 'Órdenes de trabajo', 'Work orders',
      'Aquí se registran las órdenes de trabajo (número de orden, cliente, camión y tareas de los mecánicos).',
      'Where work orders are recorded (order number, client, truck and mechanics’ tasks).', 'right'),
    S('[data-tour="nav-clientes"]', 'Clientes (CRM)', 'Clients (CRM)',
      'Tu base de clientes: empresas, sus distritos/sucursales y sus camiones. También marcas si un cliente está exento de impuestos.',
      'Your client base: companies, their districts/locations and their trucks. You also mark whether a client is tax-exempt.', 'right'),
    S('[data-tour="nav-facturacion"]', 'Facturación', 'Invoicing',
      'Crea facturas (con número fiscal), cotizaciones y órdenes; registra cobros y genera comprobantes y PDF.',
      'Create invoices (with fiscal number), estimates and work orders; record payments and generate receipts and PDFs.', 'right'),
    S('[data-tour="nav-cuentas-por-cobrar"]', 'Cuentas por cobrar', 'Accounts receivable',
      'Controla lo que te deben: saldos por cliente, antigüedad (vencidos) y cobros, cuando vendes a crédito.',
      'Track what you’re owed: balances by client, aging (overdue) and collections, when you sell on credit.', 'right'),
    S('[data-tour="nav-inventario"]', 'Inventario / Bodega', 'Inventory / Warehouse',
      'Catálogo de piezas con existencias. Al vender una pieza en una factura, el stock baja solo.',
      'Parts catalog with stock. When you sell a part on an invoice, stock goes down automatically.', 'right'),
    S('[data-tour="nav-informe-ventas"]', 'Informe de Ventas', 'Sales Report',
      'Ventas por día, semana, mes o año, de cada taller por separado y de ambos juntos.',
      'Sales by day, week, month or year, for each shop separately and both together.', 'right'),
    S('[data-tour="nav-reporte-talleres"]', 'Reporte por taller', 'Shop report',
      'Reporte financiero por negocio (facturado, sales tax, costo de piezas, ganancia) listo para el contador, exportable a PDF.',
      'Financial report by business (invoiced, sales tax, parts cost, profit) ready for the accountant, exportable to PDF.', 'right'),
    S('[data-tour="nav-configuracion"]', 'Datos de Facturación', 'Billing Settings',
      'Aquí defines cada taller: nombre legal, EIN, certificado de sales tax, tasa, prefijo, código de negocio y logo. ¡Empieza por aquí!',
      'Here you define each shop: legal name, EIN, sales tax certificate, rate, prefix, business code and logo. Start here!', 'right'),
    S('[data-tour="tour-help-btn"]', 'Botón de ayuda', 'Help button',
      'Este botón “?” reinicia el tutorial de la página en la que estés. Pruébalo en cada sección.',
      'This “?” button restarts the tutorial for whatever page you’re on. Try it in each section.', 'left'),
  ],

  // ─── Configuración (talleres) — página ───
  configuracion: [
    S(undefined, 'Datos de Facturación', 'Billing Settings',
      'Cada taller (negocio) que factura necesita sus datos fiscales aquí. Es lo primero que debes capturar.',
      'Each shop (business) that invoices needs its tax data here. This is the first thing to set up.'),
    S('[data-tour="cfg-add"]', 'Agregar taller', 'Add shop',
      'Crea un taller. Tienes dos negocios: papá (código 01) e hijo (código 02). Al abrir el formulario, el “?” explica cada campo.',
      'Create a shop. You have two businesses: dad (code 01) and son (code 02). When the form opens, the “?” explains each field.', 'bottom'),
  ],

  // ─── Configuración (formulario de taller abierto) ───
  'configuracion-form': [
    S('[data-tour="cfg-legal"]', 'Nombre legal', 'Legal name',
      'El nombre legal de la empresa que aparece en la factura (puede diferir del nombre comercial).',
      'The company’s legal name shown on the invoice (may differ from the trade name).'),
    S('[data-tour="cfg-ein"]', 'EIN', 'EIN',
      'Número de identificación patronal del IRS. Aparece en la factura como identificación fiscal.',
      'IRS Employer Identification Number. Shown on the invoice as the tax ID.'),
    S('[data-tour="cfg-cert"]', 'Certificado de Sales Tax', 'Sales Tax Certificate',
      'Tu número de certificado del FL DOR para cobrar el impuesto de ventas.',
      'Your FL DOR certificate number to collect sales tax.'),
    S('[data-tour="cfg-rate"]', 'Tasa de impuesto', 'Tax rate',
      'Porcentaje de sales tax (Orange County = 6.5%). Se aplica automáticamente a las piezas gravadas.',
      'Sales tax percentage (Orange County = 6.5%). Applied automatically to taxable parts.'),
    S('[data-tour="cfg-prefix"]', 'Prefijo de factura', 'Invoice prefix',
      'Texto al inicio del número de factura (ej. “ATR-”). Es opcional.',
      'Text at the start of the invoice number (e.g. “ATR-”). Optional.'),
    S('[data-tour="cfg-code"]', 'Código de negocio', 'Business code',
      'Dos dígitos que identifican el negocio en el número de factura (01 = papá, 02 = hijo). Activa la numeración por fecha AAAAMMDD-N-CC.',
      'Two digits identifying the business in the invoice number (01 = dad, 02 = son). Enables date numbering YYYYMMDD-N-CC.'),
    S('[data-tour="cfg-logo"]', 'Logo', 'Logo',
      'Sube el logo del taller; saldrá en el PDF de la factura. Si no subes uno, se usa el logo general.',
      'Upload the shop logo; it appears on the invoice PDF. If none, the general logo is used.'),
  ],

  // ─── Clientes (lista) ───
  clientes: [
    S(undefined, 'Clientes', 'Clients',
      'Tu directorio de clientes. Cada cliente puede tener distritos/sucursales y camiones.',
      'Your client directory. Each client can have districts/locations and trucks.'),
    S('[data-tour="cli-add"]', 'Agregar cliente', 'Add client',
      'Abre el formulario para registrar un cliente nuevo.',
      'Opens the form to register a new client.', 'bottom'),
    S('[data-tour="cli-search"]', 'Buscar', 'Search',
      'Filtra por nombre, contacto, teléfono, correo o ciudad.',
      'Filter by name, contact, phone, email or city.', 'bottom'),
    S('[data-tour="cli-row"]', 'Tarjeta del cliente', 'Client card',
      'Muestra tipo, forma de pago, términos y si está exento. Haz clic en el nombre o en la flecha para ver el detalle (distritos, camiones e historial).',
      'Shows type, payment method, terms and exempt status. Click the name or the arrow to see the detail (districts, trucks and history).', 'top'),
    S('[data-tour="cli-actions"]', 'Acciones', 'Actions',
      'Ver detalle, editar, suspender/reactivar y eliminar el cliente.',
      'View detail, edit, suspend/reactivate and delete the client.', 'left'),
  ],

  // ─── Formulario de cliente (modal/inline abierto) ───
  'cliente-form': [
    S('[data-tour="clif-type"]', 'Tipo de cliente', 'Client type',
      'Empresa (corporativo) o particular (walk-in). El corporativo suele llevar distritos y camiones.',
      'Company (corporate) or individual (walk-in). Corporate usually has districts and trucks.'),
    S('[data-tour="clif-name"]', 'Nombre', 'Name',
      'Nombre del cliente o empresa. Es lo único obligatorio.',
      'Client or company name. The only required field.'),
    S('[data-tour="clif-pay"]', 'Forma de pago y términos', 'Payment method & terms',
      'Forma de pago habitual y los días de crédito (0 = contado, 30 = Net-30). Define cuándo vence su factura.',
      'Usual payment method and credit days (0 = cash, 30 = Net-30). Sets when their invoice is due.'),
    S('[data-tour="clif-exempt"]', 'Exento de impuestos', 'Tax-exempt',
      'Marca esto si la empresa tiene certificado de exención; entonces escribe el número. Sus facturas no cobrarán sales tax.',
      'Check this if the company has an exemption certificate; then enter its number. Their invoices won’t charge sales tax.'),
  ],

  // ─── Detalle de cliente ───
  'cliente-detalle': [
    S('[data-tour="clid-locations"]', 'Distritos / Sucursales', 'Districts / Locations',
      'Las sucursales del cliente (útil para flotas grandes). Cada camión puede colgar de un distrito.',
      'The client’s locations (useful for large fleets). Each truck can belong to a district.'),
    S('[data-tour="clid-trucks"]', 'Camiones / Unidades', 'Trucks / Units',
      'Las unidades del cliente (número, placa, marca, VIN). Se eligen al facturar para llevar el historial por camión.',
      'The client’s units (number, plate, make, VIN). Picked when invoicing to keep history per truck.'),
    S('[data-tour="clid-history"]', 'Historial de trabajo', 'Work history',
      'Todas las facturas del cliente con total facturado, pagado y saldo. Puedes filtrar por camión y reimprimir cada PDF.',
      'All the client’s invoices with total billed, paid and balance. You can filter by truck and reprint each PDF.'),
  ],

  // ─── Facturación (lista) ───
  facturacion: [
    S(undefined, 'Facturación', 'Invoicing',
      'Aquí creas y gestionas facturas, cotizaciones y órdenes, y registras cobros.',
      'Here you create and manage invoices, estimates and orders, and record payments.'),
    S('[data-tour="fac-add"]', 'Nueva factura', 'New invoice',
      'Abre el formulario para crear un documento. Dentro hay un “?” que explica cada campo.',
      'Opens the form to create a document. Inside there’s a “?” that explains each field.', 'bottom'),
    S('[data-tour="fac-filters"]', 'Filtros por estado', 'Status filters',
      'Filtra por estado: borrador, abierta, parcial, pagada o anulada.',
      'Filter by status: draft, open, partial, paid or void.', 'bottom'),
    S('[data-tour="fac-row"]', 'Factura', 'Invoice',
      'Cada factura muestra su número, cliente, camión, nº de orden, estado y total/saldo.',
      'Each invoice shows its number, client, truck, order #, status and total/balance.', 'top'),
    S('[data-tour="fac-actions"]', 'Acciones de la factura', 'Invoice actions',
      'Descargar PDF, imprimir, ver comprobantes de pago, registrar un cobro, anular y eliminar. Los borradores tienen además “Emitir”.',
      'Download PDF, print, view payment receipts, record a payment, void and delete. Drafts also have “Emit”.', 'left'),
  ],

  // ─── Formulario de factura (modal abierto) ───
  'factura-form': [
    S('[data-tour="facf-doctype"]', 'Tipo de documento', 'Document type',
      'Factura (fiscal, consume número y cobra), Cotización u Orden de trabajo (no fiscales).',
      'Invoice (fiscal, consumes a number and charges), Estimate or Work order (non-fiscal).'),
    S('[data-tour="facf-order"]', 'Orden de trabajo', 'Work order',
      'Enlaza una orden ya creada; la factura hereda su número de orden y autollena cliente y camión.',
      'Link an existing work order; the invoice inherits its order number and auto-fills client and truck.'),
    S('[data-tour="facf-client"]', 'Cliente y camión', 'Client and truck',
      'Elige el cliente y, opcionalmente, el camión (se filtra por cliente). Si el cliente es exento, el impuesto se pone en $0.',
      'Pick the client and, optionally, the truck (filtered by client). If the client is exempt, tax is set to $0.'),
    S('[data-tour="facf-shop"]', 'Taller', 'Shop',
      'El negocio que emite la factura (define la numeración y la tasa de impuesto).',
      'The business issuing the invoice (sets the numbering and tax rate).'),
    S('[data-tour="facf-payment"]', 'Forma de pago', 'Payment method',
      'Efectivo, cheque, tarjeta, depósito o crédito. Si eliges crédito, la factura queda abierta y entra a Cuentas por cobrar.',
      'Cash, check, card, deposit or credit. If you pick credit, the invoice stays open and enters Accounts receivable.'),
    S('[data-tour="facf-lines"]', 'Renglones', 'Line items',
      'Agrega mano de obra y piezas. A la mano de obra puedes asignarle un mecánico y % de comisión; las piezas pueden salir de bodega (baja stock) o ser sueltas.',
      'Add labor and parts. Labor can have a mechanic and commission %; parts can come from the warehouse (reduces stock) or be one-off.'),
    S('[data-tour="facf-tax"]', 'Subtotal, impuesto y total', 'Subtotal, tax and total',
      'El sales tax se calcula solo (tasa del taller × piezas gravadas). Puedes pasarlo a manual si hace falta.',
      'Sales tax is computed automatically (shop rate × taxable parts). You can switch to manual if needed.'),
    S('[data-tour="facf-markpaid"]', 'Marcar como pagada', 'Mark as paid',
      'Si ya te pagaron al momento, marca esto y se registra el cobro y su comprobante de una vez.',
      'If you were paid right away, check this and the payment and its receipt are recorded at once.'),
    S('[data-tour="facf-submit"]', 'Crear o Guardar borrador', 'Create or Save draft',
      'Crea la factura, o guárdala como borrador para terminar el trabajo y emitirla después (ahí se generan las comisiones).',
      'Create the invoice, or save it as a draft to finish the work and emit it later (commissions are generated then).'),
  ],

  // ─── Cuentas por cobrar ───
  'cuentas-por-cobrar': [
    S(undefined, 'Cuentas por cobrar', 'Accounts receivable',
      'Todo lo que te deben los clientes que compran a crédito.',
      'Everything owed to you by clients who buy on credit.'),
    S('[data-tour="ar-kpis"]', 'Indicadores', 'KPIs',
      'Total por cobrar, cuánto está vencido, lo que vence pronto y el cliente que más debe.',
      'Total outstanding, how much is overdue, what’s due soon and the client who owes the most.', 'bottom'),
    S('[data-tour="ar-alerts"]', 'Alertas de vencidos', 'Overdue alerts',
      'Facturas atrasadas ordenadas por días de atraso, con cobro directo.',
      'Overdue invoices sorted by days late, with direct collection.', 'top'),
    S('[data-tour="ar-aging"]', 'Antigüedad de saldos', 'Balance aging',
      'Reparte el saldo por antigüedad: al día, 1–30, 31–60, 61–90 y 90+ días.',
      'Splits the balance by age: current, 1–30, 31–60, 61–90 and 90+ days.', 'top'),
  ],

  // ─── Órdenes ───
  ordenes: [
    S(undefined, 'Órdenes de trabajo', 'Work orders',
      'El registro de trabajos: número de orden, cliente, camión y las tareas de los mecánicos.',
      'The job log: order number, client, truck and the mechanics’ tasks.'),
    S('[data-tour="ord-add"]', 'Nueva orden', 'New order',
      'Crea una orden de trabajo. Su número de orden se puede usar después al facturar.',
      'Create a work order. Its order number can be reused later when invoicing.', 'bottom'),
    S('[data-tour="ord-search"]', 'Buscar', 'Search',
      'Filtra las órdenes por número, empresa o camión.',
      'Filter orders by number, company or truck.', 'bottom'),
  ],

  // ─── Inventario ───
  inventario: [
    S(undefined, 'Inventario / Bodega', 'Inventory / Warehouse',
      'Catálogo de piezas con existencias, compartido por ambos talleres.',
      'Parts catalog with stock, shared by both shops.'),
    S('[data-tour="inv-add"]', 'Agregar pieza', 'Add part',
      'Registra una pieza nueva: número de parte, costo, precio de venta y existencia.',
      'Register a new part: part number, cost, sale price and stock.', 'bottom'),
    S('[data-tour="inv-row"]', 'Pieza', 'Part',
      'Cada pieza muestra su stock. Desde aquí puedes reabastecer o ajustar; las que están bajo el mínimo se marcan.',
      'Each part shows its stock. From here you can restock or adjust; those below minimum are flagged.', 'top'),
  ],

  // ─── Gastos ───
  gastos: [
    S(undefined, 'Gastos de Piezas', 'Parts Expenses',
      'Reporte de compras de piezas y la ganancia en piezas (cobrado − costo), sin doble conteo.',
      'Report of parts purchases and parts profit (charged − cost), with no double counting.'),
    S('[data-tour="gas-period"]', 'Periodo', 'Period',
      'Elige el rango de fechas para ver los gastos de ese periodo.',
      'Pick the date range to see expenses for that period.', 'bottom'),
  ],

  // ─── Reporte por taller ───
  'reporte-talleres': [
    S(undefined, 'Reporte por taller', 'Shop report',
      'Resumen financiero por negocio para el contador.',
      'Financial summary by business for the accountant.'),
    S('[data-tour="rep-presets"]', 'Periodo', 'Period',
      'Atajos de mes/trimestre/año o un rango personalizado de fechas.',
      'Month/quarter/year shortcuts or a custom date range.', 'bottom'),
    S('[data-tour="rep-pdf"]', 'Exportar PDF', 'Export PDF',
      'Genera un PDF con la tabla por taller y el total, listo para entregar al contador.',
      'Generates a PDF with the per-shop table and total, ready to hand to the accountant.', 'left'),
  ],

  // ─── Informe de ventas ───
  'informe-ventas': [
    S(undefined, 'Informe de Ventas', 'Sales Report',
      'Ventas por periodo, de cada taller y de ambos juntos.',
      'Sales by period, for each shop and both together.'),
    S('[data-tour="sr-period"]', 'Periodo', 'Period',
      'Cambia entre diario, semanal, mensual y anual.',
      'Switch between daily, weekly, monthly and yearly.', 'bottom'),
    S('[data-tour="sr-nav"]', 'Navegación', 'Navigation',
      'Avanza o retrocede entre periodos, o vuelve a hoy. Verás el rango de fechas a la derecha.',
      'Move forward/back between periods, or jump to today. You’ll see the date range on the right.', 'bottom'),
    S('[data-tour="sr-pdf"]', 'Exportar PDF', 'Export PDF',
      'Descarga el informe del periodo seleccionado.',
      'Download the report for the selected period.', 'left'),
  ],

  // ─── Dashboard ───
  dashboard: [
    S(undefined, 'Panel Principal', 'Dashboard',
      'Tu resumen del taller: actividad de la semana y totales. Usa el menú de la izquierda para ir a cada sección.',
      'Your shop overview: this week’s activity and totals. Use the left menu to reach each section.'),
  ],
};

const BTN = {
  es: { next: 'Siguiente →', prev: '← Anterior', done: 'Listo', progress: '{{current}} de {{total}}' },
  en: { next: 'Next →', prev: '← Back', done: 'Done', progress: '{{current}} of {{total}}' },
};

export function hasTour(key: string): boolean { return Array.isArray(TOURS[key]) && TOURS[key].length > 0; }

export function startTour(key: string, lang: Lang) {
  const defs = TOURS[key];
  if (!defs || !defs.length) return;
  const steps: DriveStep[] = defs.map(s => ({
    element: s.el,
    popover: { title: lang === 'es' ? s.tEs : s.tEn, description: lang === 'es' ? s.dEs : s.dEn, side: s.side ?? 'bottom', align: 'start' },
  }));
  const b = BTN[lang];
  const d = driver({
    showProgress: true, allowClose: true, overlayColor: '#020617', stagePadding: 6, stageRadius: 10,
    nextBtnText: b.next, prevBtnText: b.prev, doneBtnText: b.done, progressText: b.progress,
    steps,
  });
  d.drive();
}

// Mapea la ruta actual a la clave de tour de su página.
export function tourKeyForPath(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '');
  if (p === '' || p === '/dashboard') return 'dashboard';
  if (p === '/clientes') return 'clientes';
  if (/^\/clientes\/[^/]+$/.test(p)) return 'cliente-detalle';
  if (p === '/facturacion') return 'facturacion';
  if (p === '/cuentas-por-cobrar') return 'cuentas-por-cobrar';
  if (p === '/ordenes') return 'ordenes';
  if (p === '/inventario') return 'inventario';
  if (p === '/gastos') return 'gastos';
  if (p === '/reporte-talleres') return 'reporte-talleres';
  if (p === '/informe-ventas') return 'informe-ventas';
  if (p === '/configuracion') return 'configuracion';
  return null;
}
