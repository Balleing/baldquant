// Decorative, illustrative L2 ladder. Nothing here is real market data.
// Each tick builds a new book object; the DOM is built once and updated.
const LEVELS = 8;
const TICK = 0.1;
const START_PRICE = 67250;
const UPDATE_MS = 650;
const START_UPDATE_ID = 48120331;

const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const midFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sizeFormat =new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const idFormat = new Intl.NumberFormat('en-US');

const randomSize = () => 0.05 + Math.pow(Math.random(), 2.2) * 4;
const walkSize = (size) => (Math.random() < 0.06 ? randomSize() * 2.5 : Math.max(0.01, size * (0.7 + Math.random() * 0.6)));

function createBook() {
  return {
    bestBid: START_PRICE,
    direction: 0,
    asks: Array.from({ length: LEVELS }, randomSize),
    bids: Array.from({ length: LEVELS }, randomSize),
    updateId: START_UPDATE_ID,
    prevUpdateId: START_UPDATE_ID - 17,
  };
}

function nextBook(book) {
  const roll = Math.random();
  const direction = roll < 0.16 ? 1 : roll < 0.32 ? -1 : 0;
  return {
    bestBid: Math.round((book.bestBid + direction * TICK) * 10) / 10,
    direction,
    asks: book.asks.map(walkSize),
    bids: book.bids.map(walkSize),
    updateId: book.updateId + 1 + Math.floor(Math.random() * 40),
    prevUpdateId: book.updateId,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildRow(side) {
  const row = el('div', `book-row book-${side}`);
  const bar = el('span', 'book-bar');
  const price = el('span', 'book-price');
  const size = el('span', 'book-size');
  row.append(bar, price, size);
  return { row, bar, price, size };
}

function buildUi(root) {
  const head = el('div', 'book-head');
  head.append(el('span', 'book-symbol', 'BTCUSDT perp'), el('span', 'book-tag', 'illustrative'));
  const columns = el('div', 'book-columns');
  columns.append(el('span', '', 'Price'), el('span', '', 'Size'));
  const asks = Array.from({ length: LEVELS }, () => buildRow('ask'));
  const bids = Array.from({ length: LEVELS }, () => buildRow('bid'));
  const mid = el('div', 'book-mid');
  const midPrice = el('span', 'book-mid-price');
  const spread = el('span', 'book-spread');
  mid.append(midPrice, spread);
  const seq = el('div', 'book-seq');
  const seqText = el('span', 'book-seq-text');
  seq.append(el('span', 'status-dot'), seqText);
  root.append(head, columns, ...asks.map((r) => r.row), mid, ...bids.map((r) => r.row), seq);
  return { asks, bids, midPrice, spread, seqText };
}

function render(ui, book) {
  const largest = Math.max(...book.asks, ...book.bids);
  const bestAsk = book.bestBid + TICK;
  ui.asks.forEach((row, i) => {
    const level = LEVELS - 1 - i;
    row.price.textContent = priceFormat.format(bestAsk + level * TICK);
    row.size.textContent = sizeFormat.format(book.asks[level]);
    row.bar.style.transform = `scaleX(${(book.asks[level] / largest).toFixed(3)})`;
  });
  ui.bids.forEach((row, i) => {
    row.price.textContent = priceFormat.format(book.bestBid - i * TICK);
    row.size.textContent = sizeFormat.format(book.bids[i]);
    row.bar.style.transform = `scaleX(${(book.bids[i] / largest).toFixed(3)})`;
  });
  ui.midPrice.textContent = midFormat.format(book.bestBid + TICK / 2);
  ui.midPrice.dataset.direction = book.direction > 0 ? 'up' : book.direction < 0 ? 'down' : 'flat';
  ui.spread.textContent = `spread ${priceFormat.format(TICK)}`;
  ui.seqText.textContent = `update ${idFormat.format(book.updateId)} · prev ${idFormat.format(book.prevUpdateId)} · in sync`;
}

/** @param {{ reducedMotion: boolean }} options */
export function initOrderBook({ reducedMotion }) {
  const root = document.querySelector('[data-orderbook]');
  if (!root) return;
  const ui = buildUi(root);
  let book = createBook();
  render(ui, book);
  if (reducedMotion) return;

  let timer = 0;
  const tick = () => {
    book = nextBook(book);
    render(ui, book);
  };
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !timer) timer = window.setInterval(tick, UPDATE_MS);
    if (!entry.isIntersecting && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  }).observe(root);
}
