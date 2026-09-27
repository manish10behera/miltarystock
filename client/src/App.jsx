import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, Box,
  ChevronDown, ChevronRight, ClipboardList, Command, FileClock, Filter,
  LayoutDashboard, LogOut, Menu, PackagePlus, Plus, Search, ShieldCheck,
  Truck, Users, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts';

const bases = ['All bases', 'North Ridge', 'Eastwatch', 'Forward Depot', 'Southpoint'];
const types = ['All equipment', 'Vehicles', 'Weapons', 'Ammunition', 'Communications'];
const stock = {
  'North Ridge': { Vehicles: 38, Weapons: 186, Ammunition: 2480, Communications: 74 },
  Eastwatch: { Vehicles: 24, Weapons: 142, Ammunition: 1960, Communications: 51 },
  'Forward Depot': { Vehicles: 31, Weapons: 94, Ammunition: 3560, Communications: 66 },
  Southpoint: { Vehicles: 19, Weapons: 128, Ammunition: 1740, Communications: 43 },
};
const equipment = [
  { name: 'Utility vehicle · M1151', type: 'Vehicles', code: 'VH-204', unit: 'units' },
  { name: 'Service rifle · M4A1', type: 'Weapons', code: 'WP-118', unit: 'units' },
  { name: '5.56 mm · M855A1', type: 'Ammunition', code: 'AM-056', unit: 'rounds' },
  { name: 'Tactical radio · AN/PRC-152', type: 'Communications', code: 'CM-091', unit: 'units' },
  { name: 'Cargo truck · FMTV', type: 'Vehicles', code: 'VH-317', unit: 'units' },
];
const initialRows = [
  { id: 'MV-4821', kind: 'Purchase', asset: '5.56 mm · M855A1', type: 'Ammunition', base: 'North Ridge', quantity: 1200, date: '2026-09-26', actor: 'M. Alvarez', detail: 'Central Supply Depot' },
  { id: 'MV-4820', kind: 'Transfer in', asset: 'Service rifle · M4A1', type: 'Weapons', base: 'North Ridge', quantity: 18, date: '2026-09-25', actor: 'J. Carter', detail: 'From Eastwatch' },
  { id: 'MV-4819', kind: 'Assignment', asset: 'Tactical radio · AN/PRC-152', type: 'Communications', base: 'North Ridge', quantity: 4, date: '2026-09-25', actor: 'M. Alvarez', detail: '2nd Recon · field exercise' },
  { id: 'MV-4818', kind: 'Transfer out', asset: 'Utility vehicle · M1151', type: 'Vehicles', base: 'North Ridge', quantity: 2, date: '2026-09-24', actor: 'J. Carter', detail: 'To Forward Depot' },
  { id: 'MV-4817', kind: 'Expenditure', asset: '5.56 mm · M855A1', type: 'Ammunition', base: 'North Ridge', quantity: 240, date: '2026-09-23', actor: 'M. Alvarez', detail: 'Range qualification' },
  { id: 'MV-4816', kind: 'Purchase', asset: 'Tactical radio · AN/PRC-152', type: 'Communications', base: 'Eastwatch', quantity: 12, date: '2026-09-22', actor: 'R. Singh', detail: 'Signal Systems LLC' },
];
const trend = [
  { day: '01 Sep', received: 22, issued: 14 }, { day: '04 Sep', received: 31, issued: 19 },
  { day: '07 Sep', received: 18, issued: 13 }, { day: '10 Sep', received: 42, issued: 20 },
  { day: '13 Sep', received: 27, issued: 16 }, { day: '16 Sep', received: 35, issued: 25 },
  { day: '19 Sep', received: 24, issued: 18 }, { day: '22 Sep', received: 48, issued: 23 },
  { day: '25 Sep', received: 38, issued: 20 }, { day: '28 Sep', received: 43, issued: 26 },
];
const navGroups = [
  { label: 'OVERVIEW', items: [{ id: 'Dashboard', icon: LayoutDashboard }, { id: 'Inventory', icon: Box }] },
  { label: 'OPERATIONS', items: [{ id: 'Purchases', icon: PackagePlus }, { id: 'Transfers', icon: ArrowLeftRight }, { id: 'Assignments', icon: Users }] },
  { label: 'RECORDS', items: [{ id: 'Activity log', icon: FileClock }] },
];
const pageDescriptions = {
  Dashboard: 'Live readiness and movement across your command.',
  Inventory: 'Available stock by equipment and installation.',
  Purchases: 'Inbound acquisitions and receiving records.',
  Transfers: 'Inter-base dispatches and receiving history.',
  Assignments: 'Issued equipment and recorded expenditure.',
  'Activity log': 'A traceable record of every inventory movement.',
};
const navForRole = {
  Admin: ['Dashboard', 'Inventory', 'Purchases', 'Transfers', 'Assignments', 'Activity log'],
  'Base Commander': ['Dashboard', 'Inventory', 'Purchases', 'Transfers', 'Assignments', 'Activity log'],
  'Logistics Officer': ['Dashboard', 'Inventory', 'Purchases', 'Transfers', 'Activity log'],
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function toRows(events, selectedBase) {
  return events.flatMap((event) => {
    const asset = event.assetId || {};
    const base = event.baseId?.name || '';
    const source = event.sourceBaseId?.name || '';
    const destination = event.destinationBaseId?.name || '';
    const common = {
      asset: asset.name || '', type: asset.type || '', quantity: event.quantity,
      date: new Date(event.eventDate).toISOString().slice(0, 10),
      actor: event.actorId?.name || 'System', detail: event.detail || '',
    };
    if (event.kind === 'transfer') {
      const entries = [];
      if (selectedBase === 'All bases' || selectedBase === source) entries.push({ ...common, id: `${event.reference}-OUT`, kind: 'Transfer out', base: source, detail: `To ${destination}${common.detail ? ` · ${common.detail}` : ''}` });
      if (selectedBase === 'All bases' || selectedBase === destination) entries.push({ ...common, id: `${event.reference}-IN`, kind: 'Transfer in', base: destination, detail: `From ${source}${common.detail ? ` · ${common.detail}` : ''}` });
      return entries;
    }
    if (event.kind === 'system') return [{ ...common, id: event.reference, kind: event.action === 'LOGIN' ? 'Login' : 'System', base }];
    const kind = { purchase: 'Purchase', assignment: 'Assignment', expenditure: 'Expenditure' }[event.kind];
    return [{ ...common, id: event.reference, kind, base }];
  });
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('fieldstock-token') || '');
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!token);
  const [baseCatalog, setBaseCatalog] = useState([]);
  const [assetsCatalog, setAssetsCatalog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [apiError, setApiError] = useState('');
  const [page, setPage] = useState('Dashboard');
  const [base, setBase] = useState('All bases');
  const [equipmentType, setEquipmentType] = useState('All equipment');
  const [period, setPeriod] = useState('Last 30 days');
  const [modal, setModal] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const role = user?.role || 'Admin';
  const baseOptions = user?.role === 'Base Commander'
    ? baseCatalog.map((entry) => entry.name)
    : ['All bases', ...baseCatalog.map((entry) => entry.name)];

  useEffect(() => {
    if (!token) return;
    let active = true;
    setReady(false);
    Promise.all([
      apiRequest('/auth/me', token),
      apiRequest('/bases', token),
      apiRequest('/assets', token),
    ]).then(([auth, baseList, assetList]) => {
      if (!active) return;
      setUser(auth.user);
      setBaseCatalog(baseList);
      setAssetsCatalog(assetList);
      if (auth.user.role === 'Base Commander' && baseList[0]) setBase(baseList[0].name);
    }).catch((error) => {
      if (!active) return;
      sessionStorage.removeItem('fieldstock-token');
      setToken('');
      setUser(null);
      setApiError(error.message);
    }).finally(() => active && setReady(true));
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !user || !baseCatalog.length) return;
    let active = true;
    const selectedBase = baseCatalog.find((entry) => entry.name === base)?._id;
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    if (period === 'Last 7 days') rangeStart.setDate(rangeEnd.getDate() - 6);
    else if (period === 'Year to date') rangeStart.setMonth(0, 1);
    else rangeStart.setDate(rangeEnd.getDate() - 29);
    const params = new URLSearchParams({ startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() });
    if (selectedBase) params.set('baseId', selectedBase);
    if (equipmentType !== 'All equipment') params.set('assetType', equipmentType);
    const inventoryParams = new URLSearchParams();
    if (selectedBase) inventoryParams.set('baseId', selectedBase);
    if (equipmentType !== 'All equipment') inventoryParams.set('assetType', equipmentType);
    const movementParams = new URLSearchParams({ startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() });
    if (selectedBase) movementParams.set('baseId', selectedBase);
    if (equipmentType !== 'All equipment') movementParams.set('assetType', equipmentType);
    Promise.all([
      apiRequest(`/dashboard?${params}`, token),
      apiRequest(`/inventory?${inventoryParams}`, token),
      apiRequest(`${page === 'Activity log' && role !== 'Logistics Officer' ? '/audit' : '/movements'}?${movementParams}&limit=500`, token),
    ]).then(([dashboard, inventory, movements]) => {
      if (!active) return;
      setSummary(dashboard);
      setInventoryRows(inventory);
      setRows(toRows(movements, base));
      setApiError('');
    }).catch((error) => active && setApiError(error.message));
    return () => { active = false; };
  }, [token, user, baseCatalog, base, equipmentType, period, page, role, refreshKey]);

  const visibleRows = useMemo(() => rows.filter((row) => (
    (base === 'All bases' || row.base === base)
    && (equipmentType === 'All equipment' || row.type === equipmentType)
    && `${row.asset} ${row.kind} ${row.base} ${row.detail}`.toLowerCase().includes(query.toLowerCase())
  )), [rows, base, equipmentType, query]);

  async function addMovement(form) {
    const asset = assetsCatalog.find((entry) => entry.name === form.asset);
    const selectedBase = baseCatalog.find((entry) => entry.name === form.base);
    const destination = baseCatalog.find((entry) => entry.name === form.destination);
    const body = {
      assetId: asset?._id,
      quantity: Number(form.quantity),
      eventDate: form.date,
      detail: form.detail || '',
    };
    if (form.kind === 'Transfer out') {
      body.sourceBaseId = selectedBase?._id;
      body.destinationBaseId = destination?._id;
    } else body.baseId = selectedBase?._id;
    const endpoint = form.kind === 'Purchase' ? '/purchases'
      : form.kind === 'Transfer out' ? '/transfers'
        : form.kind === 'Assignment' ? '/assignments' : '/expenditures';
    try {
      await apiRequest(endpoint, token, { method: 'POST', body: JSON.stringify(body) });
      setModal('');
      setRefreshKey((current) => current + 1);
      setToast('Movement recorded in the audit ledger');
    } catch (error) {
      setApiError(error.message);
      setToast(error.message);
    }
    window.setTimeout(() => setToast(''), 3500);
  }

  function logout() {
    sessionStorage.removeItem('fieldstock-token');
    setToken('');
    setUser(null);
    setBaseCatalog([]);
    setAssetsCatalog([]);
    setRows([]);
    setSummary(null);
    setModal('');
    setPage('Dashboard');
  }

  function applyFilters(form) {
    setBase(form.base);
    setEquipmentType(form.type);
    setPeriod(form.period);
    setModal('');
  }

  function openMovementForm() {
    setModal(page === 'Purchases' ? 'purchase' : page === 'Transfers' ? 'transfer' : page === 'Assignments' ? 'assignment' : 'movement');
  }

  if (!ready) return <div className="auth-loading"><span className="brand-mark"><Command size={17} /></span><p>Connecting to command inventory…</p></div>;
  if (!token || !user) return <LoginScreen error={apiError} onLogin={async (email, password) => {
    try {
      setApiError('');
      const auth = await apiRequest('/auth/login', '', { method: 'POST', body: JSON.stringify({ email, password }) });
      sessionStorage.setItem('fieldstock-token', auth.token);
      setUser(auth.user);
      setToken(auth.token);
      setPage('Dashboard');
    } catch (error) { setApiError(error.message); }
  }} />;

  function changePage(next) {
    if (navForRole[role].includes(next)) setPage(next);
    setMobileNav(false);
  }

  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Command size={17} strokeWidth={2.4} /></span><span>FIELDSTOCK</span><span className="brand-edition">OPS</span></div>
        <div className="command-switch"><span className="command-avatar">N</span><span className="command-copy"><b>Northern Command</b><small>Regional operations</small></span><ChevronDown size={15} /></div>
        <div className="nav-scroll">
          {navGroups.map((group) => <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.filter((item) => navForRole[role].includes(item.id)).map(({ id, icon: Icon }) => <button key={id} onClick={() => changePage(id)} className={`nav-item ${page === id ? 'nav-active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{id}</span>{id === 'Activity log' && <span className="nav-count">06</span>}
            </button>)}
          </div>)}
        </div>
        <div className="sidebar-bottom"><div className="readiness"><span className="readiness-dot" /><span>All systems operational</span><span className="readiness-time">09:41Z</span></div>
          <button className="profile-button" onClick={() => setModal('profile')}><span className="profile-avatar">{user.name.split(' ').map((part) => part[0]).join('')}</span><span className="profile-copy"><b>{user.name}</b><small>{role}</small></span><ChevronDown size={15} /></button>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>OPERATIONS</span><ChevronRight size={13} /><b>{page}</b></div>
          <div className="topbar-actions"><span className="sync-status"><span /> {apiError ? 'Sync issue' : 'Synced just now'}</span><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="topbar-divider" /><button className="top-user" onClick={() => setModal('profile')}><span className="profile-avatar small-avatar">{user.name.split(' ').map((part) => part[0]).join('')}</span><ChevronDown size={14} /></button></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-rule" /> NORTHERN COMMAND <span className="eyebrow-separator">/</span> LOGISTICS</div><h1>{page}</h1><p>{pageDescriptions[page]}</p></div>
            <div className="heading-actions"><button className="secondary-button" onClick={() => setModal('filters')}><Filter size={15} /> Filters</button><button className="primary-button" onClick={openMovementForm}><Plus size={16} /> Record movement</button></div>
          </section>

          <section className="filter-strip"><div className="filter-context"><span className="filter-context-label">VIEWING</span><span className="filter-separator" /><label><span>BASE</span><select value={base} onChange={(event) => setBase(event.target.value)}>{baseOptions.map((option) => <option key={option}>{option}</option>)}</select></label><span className="filter-separator" /><label><span>PERIOD</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 30 days</option><option>Last 7 days</option><option>Year to date</option></select></label><span className="filter-separator" /><label><span>EQUIPMENT</span><select value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)}>{types.map((option) => <option key={option}>{option}</option>)}</select></label></div><span className="report-date">AS OF {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} <span className="live-dot" /></span></section>

          {apiError && <div className="api-alert"><ShieldCheck size={15} />{apiError}</div>}

          {page === 'Dashboard' && <Dashboard base={base} rows={rows} period={period} summary={summary} inventoryRows={inventoryRows} onNetClick={() => setModal('net')} onPage={changePage} />}
          {page === 'Inventory' && <Inventory inventoryRows={inventoryRows} />}
          {page === 'Purchases' && <MovementPage title="Recent purchases" description="Procurement received into base inventory" rows={visibleRows.filter((row) => row.kind === 'Purchase')} onSearch={setQuery} onAdd={() => setModal('purchase')} />}
          {page === 'Transfers' && <MovementPage title="Transfer register" description="Dispatches and receipts between bases" rows={visibleRows.filter((row) => row.kind.startsWith('Transfer'))} onSearch={setQuery} onAdd={() => setModal('transfer')} />}
          {page === 'Assignments' && <MovementPage title="Issue & expenditure register" description="Personnel issue records and expended materiel" rows={visibleRows.filter((row) => ['Assignment', 'Expenditure'].includes(row.kind))} onSearch={setQuery} onAdd={() => setModal('assignment')} />}
          {page === 'Activity log' && <MovementPage title="Movement history" description="Chronological, attributable inventory events" rows={visibleRows} onSearch={setQuery} onAdd={() => setModal('movement')} />}
          <footer className="page-footer"><span>FIELDSTOCK <span className="footer-dot">·</span> INVENTORY CONTROL</span><span>INTERNAL USE <span className="footer-dot">·</span> BUILD 1.0.4</span></footer>
        </div>
      </main>
      {modal && <Modal kind={modal} onClose={() => setModal('')} rows={visibleRows} role={role} user={user} onLogout={logout} assetsCatalog={assetsCatalog} baseCatalog={baseCatalog} base={base} onSubmit={addMovement} onApplyFilters={applyFilters} />}
      {toast && <div className="toast"><ShieldCheck size={16} />{toast}</div>}
    </div>
  );
}

function LoginScreen({ error, onLogin }) {
  const [email, setEmail] = useState('admin@fieldstock.demo');
  const [password, setPassword] = useState('DemoPass!26');
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email, password);
    setSubmitting(false);
  }
  const demoAccounts = [
    { label: 'Administrator', email: 'admin@fieldstock.demo', mark: 'A' },
    { label: 'Base commander', email: 'commander@fieldstock.demo', mark: 'C' },
    { label: 'Logistics officer', email: 'logistics@fieldstock.demo', mark: 'L' },
  ];
  return <main className="login-page"><aside className="login-aside"><div className="login-brand"><span className="brand-mark"><Command size={17} /></span> FIELDSTOCK <span>OPS</span></div><div className="login-aside-copy"><div className="login-index">NORTHERN COMMAND <i /> LOGISTICS NETWORK</div><h1>Accountability<br />at every <em>handoff.</em></h1><p>A shared operational picture for the equipment that keeps teams ready.</p></div><div className="login-coordinate"><span>REGIONAL LOGISTICS GRID</span><b>41°52′ N &nbsp; 12°29′ E</b><i className="coordinate-grid" /></div></aside><section className="login-main"><form className="login-form" onSubmit={submit}><div className="login-form-heading"><span className="panel-kicker">SECURE ACCESS</span><h2>Sign in to Fieldstock</h2><p>Use your assigned command credentials.</p></div><label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="login-error">{error}</div>}<button className="primary-button login-submit" type="submit" disabled={submitting}>{submitting ? 'Authenticating…' : 'Sign in'}<ChevronRight size={15} /></button><div className="demo-access"><div className="demo-access-heading"><span>DEMO ACCOUNTS</span><i /> <small>Choose a role</small></div>{demoAccounts.map((account) => <button type="button" key={account.email} onClick={() => { setEmail(account.email); setPassword('DemoPass!26'); }}><span>{account.mark}</span><b>{account.label}</b><ChevronRight size={14} /></button>)}<small className="demo-password">Password: <code>DemoPass!26</code></small></div><div className="login-foot"><ShieldCheck size={14} /> Authorized personnel only <span>·</span> Build 1.0.4</div></form></section></main>;
}

function Dashboard({ base, rows, period, summary, inventoryRows, onNetClick, onPage }) {
  const totals = inventoryRows.reduce((result, row) => {
    result[row.asset.type] = (result[row.asset.type] || 0) + row.available;
    return result;
  }, {});
  const count = (kind) => rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.quantity, 0);
  const net = summary?.netMovement ?? count('Purchase') + count('Transfer in') - count('Transfer out');
  const issued = summary?.assigned ?? count('Assignment');
  const expended = summary?.expended ?? count('Expenditure');
  const closing = summary?.closingBalance ?? Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const opening = summary?.openingBalance ?? closing - net + issued + expended;
  const chartDataByDate = new Map();
  for (const row of rows) {
    const point = chartDataByDate.get(row.date) || { day: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), received: 0, issued: 0 };
    if (['Purchase', 'Transfer in'].includes(row.kind)) point.received += row.quantity;
    else point.issued += row.quantity;
    chartDataByDate.set(row.date, point);
  }
  const chartData = [...chartDataByDate.values()].slice(-10);
  const cards = [
    { title: 'OPENING BALANCE', value: opening.toLocaleString(), unit: 'units', meta: 'Stock at period start', icon: Box, tone: 'sand' },
    { title: 'CLOSING BALANCE', value: closing.toLocaleString(), unit: 'units', meta: 'Available across selected base', icon: ShieldCheck, tone: 'green' },
    { title: 'NET MOVEMENT', value: `${net >= 0 ? '+' : ''}${net.toLocaleString()}`, unit: 'units', meta: 'Purchases + transfers', icon: Activity, tone: 'blue', clickable: true },
    { title: 'ASSIGNED', value: issued.toLocaleString(), unit: 'units', meta: 'Issued to personnel / units', icon: Users, tone: 'gold' },
    { title: 'EXPENDED', value: expended.toLocaleString(), unit: 'units', meta: 'Consumed or written off', icon: ArrowUpRight, tone: 'rose' },
  ];
  const typeRows = Object.entries(totals).map(([type, amount]) => ({ type, amount, share: Math.round(amount / closing * 100) }));
  return <>
    <section className="metric-grid">{cards.map(({ title, value, unit, meta, icon: Icon, tone, clickable }) => <button key={title} className={`metric-card ${clickable ? 'metric-clickable' : ''}`} onClick={clickable ? onNetClick : undefined} aria-label={clickable ? 'Open net movement breakdown' : undefined}>
      <span className={`metric-icon ${tone}`}><Icon size={17} /></span><span className="metric-label">{title}{clickable && <ChevronRight size={13} />}</span><span className="metric-value">{value}<small>{unit}</small></span><span className="metric-meta">{meta}</span>
    </button>)}</section>
    <section className="dashboard-grid">
      <div className="panel trend-panel"><div className="panel-heading"><div><span className="panel-kicker">MOVEMENT OVERVIEW</span><h2>Stock flow</h2></div><div className="chart-legend"><span><i className="legend-received" /> Received</span><span><i className="legend-issued" /> Issued</span></div></div><div className="chart-summary"><strong>+{(net).toLocaleString()}</strong><span>net units <i>·</i> {period.toLowerCase()}</span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}><defs><linearGradient id="receivedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55735f" stopOpacity={0.2} /><stop offset="100%" stopColor="#55735f" stopOpacity={0} /></linearGradient><linearGradient id="issuedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c18d48" stopOpacity={0.14} /><stop offset="100%" stopColor="#c18d48" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9ebe5" strokeDasharray="3 4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#92978f', fontSize: 10 }} dy={9} /><Tooltip contentStyle={{ border: '1px solid #e7e9e3', borderRadius: 5, fontSize: 12, boxShadow: '0 5px 18px #25312512' }} /><Area type="monotone" dataKey="received" stroke="#55735f" strokeWidth={2} fill="url(#receivedFill)" /><Area type="monotone" dataKey="issued" stroke="#c18d48" strokeWidth={2} fill="url(#issuedFill)" /></AreaChart></ResponsiveContainer></div>
      </div>
      <div className="panel composition-panel"><div className="panel-heading"><div><span className="panel-kicker">ON-HAND INVENTORY</span><h2>By equipment class</h2></div><button className="text-link" onClick={() => onPage('Inventory')}>View inventory <ChevronRight size={13} /></button></div><div className="composition-total"><b>{closing.toLocaleString()}</b><span>total available</span></div><div className="composition-list">{typeRows.map((item) => <div className="composition-row" key={item.type}><span className={`type-mark type-${item.type.toLowerCase()}`} /><span className="composition-name">{item.type}</span><span className="composition-amount">{item.amount.toLocaleString()}</span><span className="composition-share">{item.share}%</span><div className="composition-bar"><i style={{ width: `${item.share}%` }} /></div></div>)}</div><div className="composition-foot"><span><i className="live-dot" /> STOCK STATUS</span><b>Within limits</b></div></div>
    </section>
    <section className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">LATEST TRANSACTIONS</span><h2>Recent activity</h2></div><button className="text-link" onClick={() => onPage('Activity log')}>Full activity log <ChevronRight size={13} /></button></div><MovementTable rows={rows.filter((row) => base === 'All bases' || row.base === base).slice(0, 5)} /></section>
  </>;
}

function Inventory({ inventoryRows }) {
  return <section className="panel data-panel"><div className="panel-heading"><div><span className="panel-kicker">ON-HAND STOCK</span><h2>Inventory by base</h2></div><span className="table-total">{inventoryRows.length} RECORDS</span></div><table className="data-table"><thead><tr><th>ASSET</th><th>CLASS</th><th>BASE</th><th>AVAILABLE</th><th>STATUS</th></tr></thead><tbody>{inventoryRows.map((row) => <tr key={`${row.base._id}-${row.asset._id}`}><td><b>{row.asset.name}</b><small>{row.asset.code}</small></td><td>{row.asset.type}</td><td>{row.base.name}</td><td className="quantity-cell">{row.available.toLocaleString()} <small>{row.asset.unit}</small></td><td><span className="status-pill"><i /> {row.available > 0 ? 'In stock' : 'Depleted'}</span></td></tr>)}</tbody></table></section>;
}

function MovementPage({ title, description, rows, onSearch, onAdd }) {
  return <section className="panel data-panel"><div className="table-toolbar"><div><span className="panel-kicker">REGISTER</span><h2>{title}</h2><p>{description}</p></div><div className="table-tools"><label className="search-field"><Search size={15} /><input placeholder="Search records" onChange={(event) => onSearch(event.target.value)} /></label><button className="small-primary" onClick={onAdd}><Plus size={14} /> New record</button></div></div><div className="register-meta"><span>{rows.length} RECORDS</span><span>NEWEST FIRST</span></div><MovementTable rows={rows} /></section>;
}

function MovementTable({ rows }) {
  if (!rows.length) return <div className="empty-state"><ClipboardList size={23} /><b>No movement records</b><span>Try a different filter or create a new record.</span></div>;
  return <div className="table-overflow"><table className="data-table movement-table"><thead><tr><th>REFERENCE</th><th>MOVEMENT</th><th>ASSET / DETAIL</th><th>BASE</th><th>QUANTITY</th><th>RECORDED</th><th>BY</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="ref-code">{row.id}</span></td><td><span className={`movement-tag tag-${row.kind.toLowerCase().replace(' ', '-')}`}>{row.kind}</span></td><td><b>{row.asset}</b><small>{row.detail}</small></td><td>{row.base}</td><td className="quantity-cell">{row.quantity.toLocaleString()}</td><td>{new Date(`${row.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><span className="actor"><i>{row.actor.split(' ').map((part) => part[0]).join('')}</i>{row.actor}</span></td></tr>)}</tbody></table></div>;
}

function Modal({ kind, onClose, rows, role, user, onLogout, assetsCatalog, baseCatalog, base, onSubmit, onApplyFilters }) {
  const activeBase = baseCatalog.find((entry) => entry.name === base)?.name || baseCatalog[0]?.name || '';
  const firstDestination = baseCatalog.find((entry) => entry.name !== activeBase)?.name || '';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ kind: kind === 'purchase' ? 'Purchase' : kind === 'transfer' ? 'Transfer out' : kind === 'assignment' ? 'Assignment' : 'Purchase', asset: assetsCatalog[0]?.name || '', type: kind === 'filters' ? 'All equipment' : assetsCatalog[0]?.type || '', base: kind === 'filters' ? base : activeBase, destination: firstDestination, quantity: 1, date: today, detail: '', period: 'Last 30 days' });
  const title = kind === 'net' ? 'Net movement breakdown' : kind === 'profile' ? 'Access profile' : kind === 'filters' ? 'Dashboard filters' : kind === 'transfer' ? 'Record transfer' : kind === 'assignment' ? 'Record assignment or expenditure' : kind === 'purchase' ? 'Record purchase' : 'Record movement';
  const baseOptions = role === 'Base Commander' ? baseCatalog : [{ name: 'All bases' }, ...baseCatalog];
  const netRows = rows.filter((row) => ['Purchase', 'Transfer in', 'Transfer out'].includes(row.kind));
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event) { event.preventDefault(); onSubmit(form); }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${kind === 'net' ? 'net-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="panel-kicker">{kind === 'net' ? 'MOVEMENT DETAIL' : kind === 'role' ? 'ROLE-BASED ACCESS' : 'NEW OPERATION'}</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {kind === 'net' && <><div className="net-summary"><span>NET MOVEMENT</span><b>{netRows.reduce((sum, row) => sum + (row.kind === 'Transfer out' ? -row.quantity : row.quantity), 0).toLocaleString()} <small>units</small></b></div><div className="net-breakdown">{['Purchase', 'Transfer in', 'Transfer out'].map((movement) => { const group = netRows.filter((row) => row.kind === movement); const total = group.reduce((sum, row) => sum + row.quantity, 0); const Icon = movement === 'Purchase' ? PackagePlus : movement === 'Transfer in' ? ArrowDownLeft : ArrowUpRight; return <div className="net-group" key={movement}><div className="net-group-heading"><span><Icon size={16} />{movement}</span><b>{movement === 'Transfer out' ? '−' : '+'}{total.toLocaleString()}</b></div>{group.length ? group.slice(0, 4).map((row) => <div className="net-item" key={row.id}><span>{row.asset}<small>{row.base} · {row.date}</small></span><b>{row.quantity.toLocaleString()}</b></div>) : <div className="net-empty">No {movement.toLowerCase()} in this period</div>}</div>; })}</div><button className="primary-button modal-done" onClick={onClose}>Done</button></>}
    {kind === 'profile' && <div className="role-picker"><p>Signed in as <b>{user.name}</b> · {user.email}</p><div className="role-option role-selected"><span className="role-symbol"><ShieldCheck size={17} /></span><span><b>{role}</b><small>{role === 'Admin' ? 'All bases · all operations' : role === 'Base Commander' ? 'Assigned base · all operations' : 'Purchases and transfers'}</small></span><span className="role-current">ACTIVE</span></div><button className="secondary-button logout-button" onClick={onLogout}><LogOut size={15} /> Sign out</button></div>}
    {kind === 'filters' && <div className="filter-modal-form"><label>Base<select value={form.base} onChange={(event) => update('base', event.target.value)}>{baseOptions.map((option) => <option key={option.name}>{option.name}</option>)}</select></label><label>Equipment type<select value={form.type} onChange={(event) => update('type', event.target.value)}>{types.map((option) => <option key={option}>{option}</option>)}</select></label><label>Period<select value={form.period} onChange={(event) => update('period', event.target.value)}><option>Last 30 days</option><option>Last 7 days</option><option>Year to date</option></select></label><button className="primary-button modal-done" onClick={() => onApplyFilters(form)}>Apply filters</button></div>}
    {!['net', 'profile', 'filters'].includes(kind) && <form className="movement-form" onSubmit={submit}><div className="form-grid"><label>Movement type<select value={form.kind} onChange={(event) => update('kind', event.target.value)}>{(kind === 'purchase' ? ['Purchase'] : kind === 'transfer' ? ['Transfer out'] : kind === 'assignment' ? ['Assignment', 'Expenditure'] : ['Purchase', 'Transfer out', 'Assignment', 'Expenditure']).map((option) => <option key={option}>{option}</option>)}</select></label><label>Equipment<select required value={form.asset} onChange={(event) => { const selected = assetsCatalog.find((item) => item.name === event.target.value); update('asset', selected.name); update('type', selected.type); }}>{assetsCatalog.map((item) => <option key={item._id}>{item.name}</option>)}</select></label><label>Base<select value={form.base} onChange={(event) => update('base', event.target.value)}>{baseCatalog.map((option) => <option key={option._id}>{option.name}</option>)}</select></label>{form.kind === 'Transfer out' && <label>Destination base<select value={form.destination} onChange={(event) => update('destination', event.target.value)}>{baseCatalog.filter((option) => option.name !== form.base).map((option) => <option key={option._id}>{option.name}</option>)}</select></label>}<label>Quantity<input type="number" min="1" required value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label><label>Date<input type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} /></label><label className="form-wide">Details<input placeholder={form.kind === 'Purchase' ? 'Supplier or purchase order' : form.kind === 'Assignment' ? 'Personnel or unit name' : form.kind === 'Expenditure' ? 'Reason for expenditure' : 'Remarks'} value={form.detail} onChange={(event) => update('detail', event.target.value)} /></label></div><div className="form-note"><ShieldCheck size={15} /> This entry will be attributed to your active account.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Plus size={15} /> Save record</button></div></form>}
  </section></div>;
}

export default App;