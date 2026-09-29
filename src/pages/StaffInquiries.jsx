import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function StaffInquiries() {
  const [user, setUser] = useState(null)
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [items, setItems] = useState([])
  const [active, setActive] = useState(null)
  const [reply, setReply] = useState('')

  async function verify(sessionUser) {
    if (!sessionUser || !supabase) {
      setAllowed(false)
      setLoading(false)
      return
    }
    const { data } = await supabase.from('users').select('role,full_name,email').eq('id', sessionUser.id).single()
    const ok = ['admin', 'staff'].includes(data?.role)
    setUser({ ...sessionUser, profile: data })
    setAllowed(ok)
    setLoading(false)
    if (ok) await load()
  }

  async function load() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('public_inquiries')
      .select('id,client_name,client_email,subject,status,created_at,updated_at')
      .order('updated_at', { ascending: false })
    if (!error) setItems(data || [])
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => verify(data.session?.user || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => verify(session?.user || null))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }
    await verify(data.user)
  }

  async function openInquiry(item) {
    const { data, error } = await supabase
      .from('public_inquiry_messages')
      .select('id,sender_type,sender_name,message,created_at')
      .eq('inquiry_id', item.id)
      .order('created_at', { ascending: true })
    if (error) return alert(error.message)
    setActive({ inquiry: item, messages: data || [] })
  }

  async function refreshActive() {
    if (!active?.inquiry?.id) return
    const latest = items.find((i) => i.id === active.inquiry.id) || active.inquiry
    await openInquiry(latest)
  }

  async function send(e) {
    e.preventDefault()
    if (!reply.trim() || !active?.inquiry?.id) return
    const text = reply.trim()
    setReply('')
    const { error } = await supabase.from('public_inquiry_messages').insert({
      inquiry_id: active.inquiry.id,
      sender_type: 'staff',
      sender_name: user?.profile?.full_name || 'CareFur Staff',
      staff_user_id: user.id,
      message: text,
    })
    if (error) return alert(error.message)
    await load()
    await refreshActive()
  }

  async function toggleStatus() {
    if (!active?.inquiry?.id) return
    const next = active.inquiry.status === 'closed' ? 'open' : 'closed'
    const { error } = await supabase.from('public_inquiries').update({ status: next }).eq('id', active.inquiry.id)
    if (error) return alert(error.message)
    const nextInquiry = { ...active.inquiry, status: next }
    setActive({ ...active, inquiry: nextInquiry })
    await load()
  }

  useEffect(() => {
    if (!allowed || !active?.inquiry?.id) return
    const timer = setInterval(() => refreshActive().catch(() => {}), 5000)
    return () => clearInterval(timer)
  }, [allowed, active?.inquiry?.id])

  if (loading) return <div className="admin-center">Loading…</div>

  if (!allowed) {
    return (
      <div className="admin-center">
        <form className="card admin-login" onSubmit={login}>
          <img src="/carefur-logo.png" />
          <h2>CareFur Staff Inquiries</h2>
          <p>Admin/staff login only.</p>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
          <button className="btn primary full">Sign in</button>
        </form>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <aside>
        <div className="brand inverse"><img src="/carefur-logo.png" /><span>CareFur</span></div>
        <h3>Client Inquiries</h3>
        <button onClick={load}>Refresh</button>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>
      <section className="inbox">
        <header><div><h1>Inquiries</h1><p>Messages from CareFur public-site clients and reservation inquiries.</p></div><span>{user?.profile?.full_name || user?.email}</span></header>
        <div className="inbox-body">
          <div className="inquiry-list">
            {items.length ? items.map((i) => (
              <button key={i.id} onClick={() => openInquiry(i)} className={active?.inquiry?.id === i.id ? 'active' : ''}>
                <b>{i.subject}</b><span>{i.client_name} · {i.client_email}</span><small>{i.status || 'open'}</small>
              </button>
            )) : <div className="empty">No inquiries.</div>}
          </div>
          <div className="thread">
            {active ? (
              <>
                <div className="thread-head">
                  <div><h2>{active.inquiry.subject}</h2><p>{active.inquiry.client_name} · {active.inquiry.client_email}</p></div>
                  <button className="btn secondary" onClick={toggleStatus}>{active.inquiry.status === 'closed' ? 'Reopen' : 'Close inquiry'}</button>
                </div>
                <div className="messages">
                  {(active.messages || []).map((m) => (
                    <div key={m.id} className={`bubble-wrap ${m.sender_type === 'staff' ? 'staff' : 'client'}`}>
                      <div className="bubble">{m.message}</div><small>{m.sender_name || m.sender_type}</small>
                    </div>
                  ))}
                </div>
                {active.inquiry.status !== 'closed' && (
                  <form className="composer" onSubmit={send}><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to client…" /><button>➤</button></form>
                )}
              </>
            ) : <div className="empty">Choose an inquiry.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
