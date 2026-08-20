import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CheckCircle2, Clock3, LogOut, Menu, QrCode, Search, UtensilsCrossed, X } from 'lucide-react';
import { restaurants as seedRestaurants } from '../../server/src/seed.js';
import './styles.css';

const publicFallback = (path, options = {}) => {
  if (path === '/auth/login') {
    const body = JSON.parse(options.body || '{}');
    if (body.email === 'admin@menuqr.local' && body.password === 'MenuQR123!') return { token: 'pages-demo-token', user: { email: body.email, role: 'admin' } };
    throw new Error('Invalid email or password');
  }
  if (path === '/restaurants') return seedRestaurants.map(({ items, ...restaurant }) => restaurant);
  const match = path.match(/^\/restaurants\/([^/]+)\/menu$/);
  if (match) { const restaurant = seedRestaurants.find(r => r.id === match[1] || r.slug === match[1]); if (!restaurant) throw new Error('Restaurant not found'); const { items, categories, ...details } = restaurant; return { restaurant: details, categories: categories.map(name => ({ name })), items }; }
  throw new Error('This operation needs the local MenuQR API.');
};
const api = async (path, options = {}) => {
  try { const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Something went wrong'); return response.json(); }
  catch { return publicFallback(path, options); }
};
const money = (n) => `₹${n}`;

function CustomerMenu() {
  const { restaurantId } = useParams(); const [data, setData] = useState(null); const [active, setActive] = useState('All'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(null);
  useEffect(() => { api(`/restaurants/${restaurantId}/menu`).then(setData).catch(() => setData({ error: true })); }, [restaurantId]);
  if (!data) return <div className="center"><Clock3 /> Loading menu…</div>;
  if (data.error) return <div className="center">Restaurant menu not found.</div>;
  const categories = ['All', ...data.categories.map(c => c.name)];
  const items = data.items.filter(i => (active === 'All' || i.category === active) && i.name.toLowerCase().includes(search.toLowerCase()));
  return <main className="guest"><header className="hero"><div className="brand"><UtensilsCrossed /> MenuQR</div><span className="table">Table menu</span><h1>{data.restaurant.name}</h1><p>{data.restaurant.tagline}</p><div className="meta">{data.restaurant.address} · {data.restaurant.phone}</div></header><section className="menu-shell"><div className="search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search the menu" /></div><div className="chips">{categories.map(c => <button key={c} className={active===c?'active':''} onClick={()=>setActive(c)}>{c}</button>)}</div><div className="items">{items.map(item => <button className="dish" key={item.id} onClick={()=>setSelected(item)}><img src={item.image} alt=""/><span className="dish-copy"><b>{item.name}</b><small>{item.description}</small><em>{money(item.price)}</em></span>{item.vegetarian && <span className="veg">●</span>}</button>)}</div></section>{selected && <div className="modal-backdrop" onClick={()=>setSelected(null)}><article className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}><X/></button><img src={selected.image} alt=""/><h2>{selected.name}</h2><p>{selected.description}</p><strong>{money(selected.price)}</strong>{selected.allergens?.length>0 && <p className="allergen">Allergens: {selected.allergens.join(', ')}</p>}</article></div>}</main>;
}

function AdminLogin() { const nav=useNavigate(); const [email,setEmail]=useState('admin@menuqr.local'); const [password,setPassword]=useState('MenuQR123!'); const [error,setError]=useState(''); const submit=async e=>{e.preventDefault();try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('menuqr-token',d.token);nav('/admin');}catch(e){setError(e.message)}}; return <div className="auth"><form onSubmit={submit}><UtensilsCrossed size={34}/><h1>Admin sign in</h1><p>Manage your restaurants and table QR codes.</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password"/>{error&&<p className="error">{error}</p>}<button>Sign in</button><Link to="/r/spice-garden">View sample menu</Link></form></div> }

function Admin() { const [restaurants,setRestaurants]=useState([]); const [selected,setSelected]=useState(null); const [tab,setTab]=useState('overview'); const token=localStorage.getItem('menuqr-token'); const nav=useNavigate(); useEffect(()=>{if(!token) nav('/admin/login'); else api('/restaurants').then(setRestaurants).catch(()=>nav('/admin/login'));},[token,nav]); const current=selected||restaurants[0]; const url=current?`${location.origin}${location.pathname}#/r/${current.slug}`:''; return <div className="admin"><aside><div className="logo"><UtensilsCrossed/> MenuQR</div><button className={tab==='overview'?'selected':''} onClick={()=>setTab('overview')}>Overview</button><button className={tab==='restaurants'?'selected':''} onClick={()=>setTab('restaurants')}>Restaurants</button><button className={tab==='qr'?'selected':''} onClick={()=>setTab('qr')}><QrCode size={17}/> Table QR</button><button className="logout" onClick={()=>{localStorage.removeItem('menuqr-token');nav('/admin/login')}}><LogOut size={17}/> Sign out</button></aside><section className="dashboard"><header><div><p className="eyebrow">Restaurant administration</p><h1>{tab==='qr'?'Table QR codes':tab==='restaurants'?'Restaurants':'Overview'}</h1></div><Link className="open-menu" to={current?`/r/${current.slug}`:'#'} target="_blank">Open guest menu</Link></header>{tab==='overview'&&<><div className="stats"><div><small>Restaurants</small><b>{restaurants.length}</b></div><div><small>Live menu items</small><b>{restaurants.reduce((n,r)=>n+r.itemCount,0)}</b></div><div><small>Table QR codes</small><b>{restaurants.length*8}</b></div></div><div className="panel"><h2>Your restaurants</h2>{restaurants.map(r=><button key={r.id} className="restaurant-row" onClick={()=>setSelected(r)}><span><b>{r.name}</b><small>{r.address}</small></span><span>{r.itemCount} dishes</span></button>)}</div></>}{tab==='restaurants'&&<div className="panel"><h2>Restaurant directory</h2><p>Each restaurant has its own public menu URL and QR codes.</p>{restaurants.map(r=><div className="restaurant-row" key={r.id}><span><b>{r.name}</b><small>{r.slug} · {r.phone}</small></span><Link to={`/r/${r.slug}`} target="_blank">Preview</Link></div>)}</div>}{tab==='qr'&&current&&<div className="qr-layout"><div className="panel"><h2>{current.name}</h2><p>Select a table QR code to download or print. Every code opens this restaurant’s menu only.</p><div className="table-grid">{Array.from({length:8},(_,i)=><button key={i} onClick={()=>setSelected({...current, table:i+1})}>Table {i+1}</button>)}</div></div><div className="qr-card"><QRCodeSVG value={`${url}?table=${current.table||1}`} size={190}/><h3>{current.name}</h3><p>Table {current.table||1}</p><small>{url}</small></div></div>}</section></div> }
function App(){return <Routes><Route path="/r/:restaurantId" element={<CustomerMenu/>}/><Route path="/menu/restaurant/:restaurantId" element={<CustomerMenu/>}/><Route path="/admin/login" element={<AdminLogin/>}/><Route path="/admin/*" element={<Admin/>}/><Route path="*" element={<Navigate to="/r/spice-garden" replace/>}/></Routes>};
createRoot(document.getElementById('root')).render(<HashRouter><App/></HashRouter>);
