import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)
const DEFAULT_ADDRESS = 'Unit 107 Reyes Bldg. Malagasang 1B, Imus, Philippines, 4103'
const CHAT_STORAGE_KEY = 'carefur-public-inquiry-v3'

const ROOM_CATALOG = [
  { key: '01', room_number: '01', display_name: 'Room 01', wing: 'Main Wing', deck: 'Upper Deck', category: 'Basic', price: 600, ideal: 'Toy, small-size' },
  { key: '02', room_number: '02', display_name: 'Room 02', wing: 'Main Wing', deck: 'Upper Deck', category: 'Basic', price: 600, ideal: 'Toy, small-size' },
  { key: '03', room_number: '03', display_name: 'Room 03', wing: 'Main Wing', deck: 'Upper Deck', category: 'Basic', price: 600, ideal: 'Toy, small-size' },
  { key: '04', room_number: '04', display_name: 'Room 04', wing: 'Main Wing', deck: 'Upper Deck', category: 'Comfort', price: 700, ideal: 'Small, compact' },
  { key: '05', room_number: '05', display_name: 'Room 05', wing: 'Main Wing', deck: 'Upper Deck', category: 'Comfort', price: 700, ideal: 'Small, compact' },
  { key: '06', room_number: '06', display_name: 'Room 06', wing: 'Main Wing', deck: 'Upper Deck', category: 'Comfort', price: 700, ideal: 'Small, compact' },
  { key: '07', room_number: '07', display_name: 'Room 07', wing: 'Main Wing', deck: 'Lower Deck', category: 'Deluxe', price: 800, ideal: 'Medium to large' },
  { key: '08', room_number: '08', display_name: 'Room 08', wing: 'Main Wing', deck: 'Lower Deck', category: 'Deluxe', price: 800, ideal: 'Medium to large' },
  { key: '09', room_number: '09', display_name: 'Room 09', wing: 'Main Wing', deck: 'Lower Deck', category: 'Premium', price: 900, ideal: 'Large / shared suite' },
  { key: '10', room_number: '10', display_name: 'Room 10', wing: 'Main Wing', deck: 'Lower Deck', category: 'Premium', price: 900, ideal: 'Large / shared suite' },
  { key: '01A', room_number: '01-A', display_name: 'Room 01-A', wing: 'Suites Wing', deck: 'Executive Row', category: 'Deluxe', price: 800, ideal: 'Medium to large' },
  { key: '02A', room_number: '02-A', display_name: 'Room 02-A', wing: 'Suites Wing', deck: 'Executive Row', category: 'Premium', price: 900, ideal: 'Large / shared suite' },
  { key: '03A', room_number: '03-A', display_name: 'Room 03-A', wing: 'Suites Wing', deck: 'Executive Row', category: 'Executive', price: 1050, ideal: 'Large–extra large' },
  { key: '04A', room_number: '04-A', display_name: 'Room 04-A', wing: 'Suites Wing', deck: 'Executive Row', category: 'Executive', price: 1050, ideal: 'Large–extra large' },
  { key: '05A', room_number: '05-A', display_name: 'Room 05-A', wing: 'Suites Wing', deck: 'Executive Row', category: 'Executive', price: 1050, ideal: 'Large–extra large' },
]


function normalizeRoom(value = '') {
  const cleaned = String(value)
    .toUpperCase()
    .replace(/ROOM/g, '')
    .replace(/SUITE/g, '')
    .replace(/[^A-Z0-9]/g, '')
  const match = cleaned.match(/([A-Z]*)(\d+)([A-Z]*)/)
  if (!match) return cleaned
  const prefix = match[1] || ''
  const number = String(parseInt(match[2], 10))
  const suffix = match[3] || ''
  return `${prefix}${number}${suffix}`
}

function peso(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatShortDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function countNights(start, end) {
  if (!start || !end) return 0
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  const diff = Math.ceil((b - a) / 86400000)
  return Number.isFinite(diff) && diff > 0 ? diff : 0
}

function buildRooms(dynamicRooms) {
  const liveRooms = [...(dynamicRooms || [])].sort((a, b) =>
    String(a.room_number || a.room_name || '').localeCompare(
      String(b.room_number || b.room_name || ''),
      undefined,
      { numeric: true }
    )
  )

  return ROOM_CATALOG.map((base, index) => {
    const live = liveRooms[index] || null
    const availability =
      live?.availability_status ||
      (live?.available === true ? 'available' : live?.available === false ? 'occupied' : null) ||
      live?.availability ||
      'contact'

    return {
      ...base,
      id: live?.room_id || live?.id || null,
      room_number: live?.room_number || base.room_number,
      display_name: live?.room_number ? `Room ${live.room_number}` : base.display_name,
      room_name: live?.room_name || `${base.category} Suite`,
      capacity: live?.capacity || null,
      room_status: live?.room_status || live?.status || null,
      availability_status: availability,
      source: live ? 'database' : 'catalog',
      selectable: availability === 'available' && Boolean(live?.room_id || live?.id),
    }
  })
}

export default function PublicHome() {
  const [date, setDate] = useState(today())
  const [dynamicRooms, setDynamicRooms] = useState([])
  const [reviews, setReviews] = useState([])
  const [roomLoading, setRoomLoading] = useState(true)
  const [roomError, setRoomError] = useState('')
  const [reservationResult, setReservationResult] = useState('')
  const [reviewResult, setReviewResult] = useState('')
  const [selectedRoomKey, setSelectedRoomKey] = useState('')
  const [reservationCheckIn, setReservationCheckIn] = useState(today())
  const [reservationCheckOut, setReservationCheckOut] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reservationSubmitting, setReservationSubmitting] = useState(false)
  const [roomAvailabilityFilter, setRoomAvailabilityFilter] = useState('available')
  const [roomCategoryFilter, setRoomCategoryFilter] = useState('all')
  const [roomSort, setRoomSort] = useState('room')

  const [chatOpen, setChatOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('rooms')
  const [chatLoading, setChatLoading] = useState(false)
  const [activeInquiry, setActiveInquiry] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [chatError, setChatError] = useState('')
  const [newInquiryState, setNewInquiryState] = useState({ name: '', email: '', subject: '' })
  const [showAllRooms, setShowAllRooms] = useState(false)
  const messageEndRef = useRef(null)

  const address = import.meta.env.VITE_CAREFUR_ADDRESS || DEFAULT_ADDRESS
  const phone = import.meta.env.VITE_CAREFUR_PHONE || '09308363061'
  const email = import.meta.env.VITE_CAREFUR_EMAIL || 'beiaannr@gmail.com'
  const mapsUrl = import.meta.env.VITE_CAREFUR_MAPS_URL || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`

  const rooms = useMemo(() => buildRooms(dynamicRooms).slice(0, 15), [dynamicRooms])
  const availableRooms = useMemo(() => rooms.filter((r) => r.availability_status === 'available'), [rooms])
  const filteredRooms = useMemo(() => {
    const list = rooms.filter((room) => {
      const matchesAvailability = roomAvailabilityFilter === 'all' || room.availability_status === roomAvailabilityFilter
      const matchesCategory = roomCategoryFilter === 'all' || room.category === roomCategoryFilter
      return matchesAvailability && matchesCategory
    })
    return [...list].sort((a, b) => {
      if (roomSort === 'price-low') return a.price - b.price
      if (roomSort === 'price-high') return b.price - a.price
      if (roomSort === 'category') return a.category.localeCompare(b.category)
      return a.display_name.localeCompare(b.display_name, undefined, { numeric: true })
    })
  }, [rooms, roomAvailabilityFilter, roomCategoryFilter, roomSort])
  const occupiedRooms = useMemo(() => rooms.filter((r) => r.availability_status === 'occupied'), [rooms])
  const displayedRooms = useMemo(() => (showAllRooms ? filteredRooms : filteredRooms.slice(0, 6)), [filteredRooms, showAllRooms])
  const selectedRoom = useMemo(() => rooms.find((r) => r.key === selectedRoomKey) || null, [rooms, selectedRoomKey])
  const nights = useMemo(() => countNights(reservationCheckIn, reservationCheckOut), [reservationCheckIn, reservationCheckOut])
  const estimatedTotal = useMemo(() => (selectedRoom?.price && nights ? selectedRoom.price * nights : 0), [selectedRoom, nights])

  async function loadRooms() {
    if (!supabase) return
    setRoomLoading(true)
    setRoomError('')
    try {
      const { data, error } = await supabase.rpc('public_room_availability', { target_date: date })
      if (error) throw error
      setDynamicRooms(data || [])
    } catch (err) {
      console.error('Room availability:', err)
      setDynamicRooms([])
      setRoomError('Room availability is not connected yet. Apply the latest public-site SQL patch, then refresh this page.')
    } finally {
      setRoomLoading(false)
    }
  }

  async function loadReviews() {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('public_reviews')
        .select('id,reviewer_name,rating,comment,created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6)
      if (error) throw error
      setReviews(data || [])
    } catch (err) {
      console.warn('Reviews are not ready:', err)
      setReviews([])
    }
  }

  useEffect(() => {
    loadRooms()
  }, [date])

  useEffect(() => {
    loadReviews()
  }, [])

  useEffect(() => {
    const sectionIds = ['rooms', 'reservation', 'reviews', 'app', 'location']
    const handleScroll = () => {
      const offset = 120
      let current = 'rooms'
      for (const id of sectionIds) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top - offset <= 0) current = id
      }
      setActiveSection((prev) => (chatOpen ? 'inquiries' : current))
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [chatOpen])

  useEffect(() => {
    setShowAllRooms(false)
  }, [date, roomAvailabilityFilter, roomCategoryFilter, roomSort])

  function saveInquirySession(next) {
    if (next) localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(CHAT_STORAGE_KEY)
  }

  function getInquirySession() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async function loadSavedInquiry() {
    const saved = getInquirySession()
    if (!saved?.inquiryId || !saved?.accessToken || !supabase) return false
    try {
      setChatLoading(true)
      const { data, error } = await supabase.rpc('get_public_inquiry_thread', {
        p_inquiry_id: saved.inquiryId,
        p_access_token: saved.accessToken,
      })
      if (error) throw error
      const list = data || []
      if (!list.length) throw new Error('Inquiry not found')
      setActiveInquiry({
        id: saved.inquiryId,
        accessToken: saved.accessToken,
        subject: list[0].subject,
        status: list[0].status,
        client_name: list[0].client_name,
        client_email: list[0].client_email,
      })
      setNewInquiryState((prev) => ({
        ...prev,
        name: list[0].client_name || prev.name,
        email: list[0].client_email || prev.email,
        subject: list[0].subject || prev.subject,
      }))
      setMessages(list.map((item) => ({
        id: item.id,
        sender_type: item.sender_type,
        sender_name: item.sender_name,
        message: item.message,
        created_at: item.created_at,
      })))
      setChatError('')
      return true
    } catch (err) {
      console.error(err)
      saveInquirySession(null)
      setActiveInquiry(null)
      setMessages([])
      return false
    } finally {
      setChatLoading(false)
    }
  }

  useEffect(() => {
    if (!chatOpen) return
    loadSavedInquiry().catch(() => {})
  }, [chatOpen])

  useEffect(() => {
    if (!chatOpen || !activeInquiry?.id || !activeInquiry?.accessToken) return
    const timer = setInterval(() => {
      loadSavedInquiry().catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [chatOpen, activeInquiry?.id, activeInquiry?.accessToken])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatOpen])

  async function submitReservation(e) {
    e.preventDefault()
    if (!supabase) return
    setReservationSubmitting(true)
    setReservationResult('')
    try {
      const fd = Object.fromEntries(new FormData(e.currentTarget))
      if (!selectedRoom) {
        setReservationResult('Please choose a room first.')
        return
      }
      if (!reservationCheckIn || !reservationCheckOut || nights <= 0) {
        setReservationResult('Please enter a valid check-in and check-out date.')
        return
      }
      const { error } = await supabase.rpc('create_public_reservation_request', {
        p_owner_name: String(fd.owner_name || '').trim(),
        p_email: String(fd.owner_email || '').trim().toLowerCase(),
        p_phone: String(fd.owner_phone || '').trim(),
        p_pet_name: String(fd.pet_name || '').trim(),
        p_pet_species: String(fd.species || '').trim(),
        p_pet_breed: String(fd.breed || '').trim() || null,
        p_room_id: selectedRoom.id || null,
        p_requested_room_number: selectedRoom.display_name,
        p_check_in_at: new Date(`${reservationCheckIn}T12:00:00`).toISOString(),
        p_expected_check_out_at: new Date(`${reservationCheckOut}T12:00:00`).toISOString(),
        p_special_instructions: String(fd.notes || '').trim() || null,
        p_room_rate_per_night: selectedRoom.price,
        p_nights: nights,
        p_estimated_total: estimatedTotal,
      })
      if (error) throw error
      setReservationResult(`Reservation request submitted for ${selectedRoom.display_name}. Estimated total: ${peso(estimatedTotal || selectedRoom.price)}. Please visit CareFur to pay in-store and finalize the booking.`)
      e.currentTarget.reset()
      setSelectedRoomKey('')
      setReservationCheckIn(today())
      setReservationCheckOut('')
    } catch (err) {
      console.error(err)
      setReservationResult('Unable to submit your reservation yet. Apply the latest SQL patch and try again.')
    } finally {
      setReservationSubmitting(false)
    }
  }

  async function submitReview(e) {
    e.preventDefault()
    if (!supabase) return
    setReviewSubmitting(true)
    setReviewResult('')
    try {
      const fd = Object.fromEntries(new FormData(e.currentTarget))
      const reviewerEmail = String(fd.reviewer_email || '').trim().toLowerCase()
      if (!reviewerEmail.endsWith('@gmail.com')) {
        setReviewResult('Please use a Gmail address for reviews.')
        return
      }
      const { error } = await supabase.rpc('submit_public_review', {
        p_reviewer_name: String(fd.reviewer_name || '').trim(),
        p_reviewer_email: reviewerEmail,
        p_rating: Number(fd.rating),
        p_comment: String(fd.comment || '').trim(),
      })
      if (error) throw error
      setReviewResult('Thank you. Your review was submitted and is waiting for approval.')
      e.currentTarget.reset()
    } catch (err) {
      console.error(err)
      setReviewResult('Unable to submit review right now. Apply the latest SQL patch and try again.')
    } finally {
      setReviewSubmitting(false)
    }
  }

  function openConnectToStaff() {
    setChatOpen(true)
    setActiveSection('inquiries')
    setChatError('')
  }

  async function startInquiry(e) {
    e.preventDefault()
    if (!supabase) return
    setChatLoading(true)
    setChatError('')
    try {
      const fd = Object.fromEntries(new FormData(e.currentTarget))
      const name = String(fd.client_name || '').trim()
      const clientEmail = String(fd.client_email || '').trim().toLowerCase()
      const subject = String(fd.subject || '').trim()
      const firstMessage = String(fd.message || '').trim()
      const { data, error } = await supabase.rpc('create_public_inquiry', {
        p_client_name: name,
        p_client_email: clientEmail,
        p_subject: subject,
        p_first_message: firstMessage,
      })
      if (error) throw error
      const created = Array.isArray(data) ? data[0] : data
      if (!created?.inquiry_id || !created?.access_token) throw new Error('Invalid inquiry response')
      saveInquirySession({ inquiryId: created.inquiry_id, accessToken: created.access_token })
      setNewInquiryState({ name, email: clientEmail, subject })
      await loadSavedInquiry()
    } catch (err) {
      console.error(err)
      setChatError('Unable to connect to staff right now. Apply the latest SQL patch and try again.')
    } finally {
      setChatLoading(false)
    }
  }

  async function sendInquiry(e) {
    e.preventDefault()
    if (!supabase || !activeInquiry?.id || !activeInquiry?.accessToken || !message.trim()) return
    const outgoing = message.trim()
    setChatError('')
    setMessage('')
    try {
      const { error } = await supabase.rpc('send_public_inquiry_message', {
        p_inquiry_id: activeInquiry.id,
        p_access_token: activeInquiry.accessToken,
        p_sender_name: newInquiryState.name || activeInquiry.client_name || 'Client',
        p_message: outgoing,
      })
      if (error) throw error
      await loadSavedInquiry()
    } catch (err) {
      console.error(err)
      setMessage(outgoing)
      setChatError('Unable to send message right now.')
    }
  }

  function resetInquiry() {
    saveInquirySession(null)
    setActiveInquiry(null)
    setMessages([])
    setActiveSection('inquiries')
    setChatError('')
  }

  return (
    <>
      <Header onOpenInquiry={() => { setChatOpen(true); setActiveSection('inquiries') }} activeSection={activeSection} />
      <main id="top">
        <section className="hero shell hero-owner-view">
          <div className="hero-copy">
            <span className="eyebrow">PET HOTEL + CONNECTED CARE</span>
            <h1>Comfortable stays.<br /><span>Closer connection.</span></h1>
            <p>Find available rooms, estimate boarding cost, reserve a stay, and message CareFur staff before you visit.</p>
            <div className="hero-actions">
              <a className="btn primary" href="#reservation">Reserve now</a>
              <a className="btn secondary" href="#rooms">View rooms</a>
            </div>
            <div className="payment-note">
              <b>✓ In-store payment only</b>
              <span>Reservation requests are submitted online, but payment and final booking confirmation happen at CareFur.</span>
            </div>
          </div>
          <div className="hero-owner-card card">
            <div className="pet-icon-wrap">🐕</div>
            <span className="eyebrow">CAREFUR OWNER ACCESS</span>
            <h3>Peace of mind while your pet is away.</h3>
            <p>Check room availability, send an inquiry, and reserve a room using one clean website designed for pet owners.</p>
            <div className="hero-mini-points">
              <span>Live room status</span>
              <span>Clear room rates</span>
              <span>Fast reservation request</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="rooms">
          <div className="section-head split">
            <div>
              <span className="eyebrow">ROOM AVAILABILITY</span>
              <h2>Choose from 15 featured rooms</h2>
              <p>By default, the list starts with available rooms only. Browse the first 6 rooms, then show more when needed.</p>
            </div>
            <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>

          <div className="summary">
            <div><strong>{availableRooms.length}</strong><span>Available</span></div>
            <div><strong>{occupiedRooms.length}</strong><span>Occupied</span></div>
            <div><strong>{rooms.filter((r) => r.availability_status === 'contact').length}</strong><span>Ask staff</span></div>
          </div>

          <div className="room-toolbar card">
            <div className="toolbar-copy">
              <b>Room list</b>
              <span>Showing 6 rooms first for a cleaner pet-owner view.</span>
            </div>
            <div className="toolbar-filters">
              <label>Status
                <select value={roomAvailabilityFilter} onChange={(e) => setRoomAvailabilityFilter(e.target.value)}>
                  <option value="available">Available</option>
                  <option value="all">All rooms</option>
                  <option value="occupied">Occupied</option>
                  <option value="contact">Ask staff</option>
                </select>
              </label>
              <label>Type
                <select value={roomCategoryFilter} onChange={(e) => setRoomCategoryFilter(e.target.value)}>
                  <option value="all">All types</option>
                  <option>Basic</option>
                  <option>Comfort</option>
                  <option>Deluxe</option>
                  <option>Premium</option>
                  <option>Executive</option>
                </select>
              </label>
              <label>Sort
                <select value={roomSort} onChange={(e) => setRoomSort(e.target.value)}>
                  <option value="room">Room number</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="category">Room type</option>
                </select>
              </label>
            </div>
          </div>

          {roomLoading ? (
            <div className="empty">Loading room availability…</div>
          ) : roomError ? (
            <div className="empty error-state"><b>Room connection needed</b><span>{roomError}</span></div>
          ) : (
            <div className="grid rooms enhanced-rooms">
              {displayedRooms.length ? displayedRooms.map((r) => {
                const statusClass = r.availability_status === 'available' ? 'ok' : r.availability_status === 'occupied' ? 'busy' : 'neutral'
                const isSelected = selectedRoomKey === r.key
                return (
                  <article className={`card room rich-room ${isSelected ? 'selected' : ''}`} key={r.key}>
                    <div className="row top-row">
                      <div>
                        <h3>{r.display_name}</h3>
                        <p>{r.category} • {r.deck}</p>
                      </div>
                      <span className={`pill ${statusClass}`}>{r.availability_status === 'available' ? 'Available' : r.availability_status === 'occupied' ? 'Occupied' : 'Ask staff'}</span>
                    </div>
                    <div className="room-compact-meta">
                      <span>{r.category}</span>
                      <span>•</span>
                      <span>{peso(r.price)} / night</span>
                    </div>
                    <div className="room-actions">
                      <div className="rate-block"><small>{r.ideal}</small></div>
                      <button
                        type="button"
                        className={`btn ${r.availability_status === 'available' ? 'primary' : 'secondary'}`}
                        disabled={r.availability_status !== 'available'}
                        onClick={() => {
                          setSelectedRoomKey(r.key)
                          document.getElementById('reservation')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        {r.availability_status === 'available' ? (isSelected ? 'Selected' : 'Select room') : 'Unavailable'}
                      </button>
                    </div>
                  </article>
                )
              }) : <div className="empty">No rooms match the selected filters.</div>}
            </div>
          )}

          {!roomLoading && !roomError && filteredRooms.length > 6 && (
            <div className="show-more-wrap">
              <button className="btn secondary" type="button" onClick={() => setShowAllRooms((prev) => !prev)}>
                {showAllRooms ? 'Show fewer rooms' : `Show more rooms (${filteredRooms.length - 6} more)`}
              </button>
            </div>
          )}
        </section>

        <section className="section soft" id="reservation">
          <div className="shell two-col reservation-grid">
            <div>
              <span className="eyebrow">RESERVATION REQUEST</span>
              <h2>Estimate your stay before you visit</h2>
              <p>Choose an available room, select your dates, and review the estimated total. Final confirmation still happens on-site after payment.</p>
              <div className="steps">
                <p><b>1.</b> Pick an available room.</p>
                <p><b>2.</b> Enter your pet and owner details.</p>
                <p><b>3.</b> See the nightly rate and estimated total.</p>
                <p><b>4.</b> Visit CareFur to pay and confirm.</p>
              </div>
              <div className="estimator card">
                <h3>Selected room summary</h3>
                {selectedRoom ? (
                  <>
                    <div className="summary-line"><span>Room</span><b>{selectedRoom.display_name}</b></div>
                    <div className="summary-line"><span>Category</span><b>{selectedRoom.category}</b></div>
                    <div className="summary-line"><span>Rate</span><b>{peso(selectedRoom.price)} / night</b></div>
                    <div className="summary-line"><span>Nights</span><b>{nights || 0}</b></div>
                    <div className="summary-line total"><span>Estimated total</span><b>{estimatedTotal ? peso(estimatedTotal) : peso(selectedRoom.price)}</b></div>
                  </>
                ) : (
                  <p className="muted-block">Select an available room above to auto-fill the estimate.</p>
                )}
              </div>
            </div>

            <form className="card form" onSubmit={submitReservation}>
              <div className="form-title"><h3>Reservation details</h3><span className="pill busy">Pay in store</span></div>
              <div className="form-grid">
                <label>Owner full name *<input name="owner_name" required /></label>
                <label>Email *<input name="owner_email" type="email" required /></label>
                <label>Phone *<input name="owner_phone" required /></label>
                <label>Pet name *<input name="pet_name" required /></label>
                <label>Species *<select name="species" required><option value="">Select</option><option>Dog</option><option>Cat</option><option>Other</option></select></label>
                <label>Breed<input name="breed" /></label>
                <label>Check-in *<input name="check_in" type="date" value={reservationCheckIn} min={today()} onChange={(e) => setReservationCheckIn(e.target.value)} required /></label>
                <label>Check-out *<input name="check_out" type="date" value={reservationCheckOut} min={reservationCheckIn || today()} onChange={(e) => setReservationCheckOut(e.target.value)} required /></label>
              </div>
              <label>
                Available room *
                <select value={selectedRoomKey} onChange={(e) => setSelectedRoomKey(e.target.value)} required>
                  <option value="">Choose a room</option>
                  {availableRooms.map((r) => (
                    <option key={r.key} value={r.key}>{r.display_name} — {r.category} — {peso(r.price)}</option>
                  ))}
                </select>
              </label>
              <label>Special instructions<textarea name="notes" rows="4" placeholder="Feeding reminders, temperament notes, care requests…" /></label>
              <div className="estimate-box">
                <span>Estimated total</span>
                <b>{selectedRoom ? (estimatedTotal ? peso(estimatedTotal) : `${peso(selectedRoom.price)} / night`) : 'Select a room'}</b>
              </div>
              <button className="btn primary full" disabled={reservationSubmitting}>{reservationSubmitting ? 'Submitting…' : 'Submit reservation request'}</button>
              {reservationResult && <div className="result">{reservationResult}</div>}
            </form>
          </div>
        </section>

        <section className="section shell" id="reviews">
          <div className="section-head center">
            <span className="eyebrow">REVIEWS</span>
            <h2>Feedback from pet owners</h2>
            <p>Reviews are welcome, and a Gmail address is required when submitting one.</p>
          </div>
          <div className="grid reviews">
            {reviews.length ? reviews.map((r, i) => (
              <article className="card review" key={r.id || i}>
                <div className="stars">{'★'.repeat(r.rating || 5)}</div>
                <p>“{r.comment}”</p>
                <b>{r.reviewer_name}</b>
                <small>{formatShortDate(r.created_at)}</small>
              </article>
            )) : <div className="empty">Approved reviews will appear here.</div>}
          </div>
          <form className="card review-form" onSubmit={submitReview}>
            <h3>Share your experience</h3>
            <div className="form-grid">
              <label>Your name *<input name="reviewer_name" required /></label>
              <label>Gmail address *<input name="reviewer_email" type="email" placeholder="yourname@gmail.com" required /></label>
              <label>Rating *<select name="rating" defaultValue="5"><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Fair</option><option value="1">1 — Poor</option></select></label>
            </div>
            <label>Review *<textarea name="comment" required rows="3" /></label>
            <button className="btn secondary" disabled={reviewSubmitting}>{reviewSubmitting ? 'Submitting…' : 'Submit review'}</button>
            {reviewResult && <span className="inline-result">{reviewResult}</span>}
          </form>
        </section>


        <section className="section app-owner-section" id="app">
          <div className="shell app-owner-grid">
            <div className="app-owner-copy">
              <span className="eyebrow">CAREFUR OWNER APP</span>
              <h2>Your pet’s stay, in your pocket.</h2>
              <p>Use the CareFur owner app during boarding to view stay details, feeding activity, pet information, camera access, and messages from staff.</p>
              <div className="app-owner-features">
                <span>✓ Boarding details</span>
                <span>✓ Feeding activity</span>
                <span>✓ Live room camera</span>
                <span>✓ Pet profile</span>
                <span>✓ Staff messaging</span>
                <span>✓ Stay updates</span>
              </div>
              <div className="hero-actions app-owner-actions">
                <a className="btn primary" href={import.meta.env.VITE_CAREFUR_ANDROID_URL || '#'}>Android download</a>
                <a className="btn secondary" href={import.meta.env.VITE_CAREFUR_HUAWEI_URL || '#'}>Huawei / AppGallery</a>
              </div>
            </div>
            <div className="card app-owner-qr">
              <img src="/app-qr-custom.png" alt="CareFur app QR code" />
              <h3>Scan for CareFur</h3>
              <p>Scan the QR code on your phone for quick access to the CareFur owner app.</p>
            </div>
          </div>
        </section>

        <section className="section shell" id="location">
          <div className="two-col location">
            <div>
              <span className="eyebrow">LOCATION</span>
              <h2>Visit CareFur</h2>
              <p>All reservations are finalized at the pet hotel, where payment and staff confirmation are completed.</p>
              <div className="info">
                <p><b>📍 Address</b><br />{address}</p>
                <p><b>☎ Contact</b><br />{phone}<br />{email}</p>
                <p><b>💳 Payment</b><br />In-store payment only.</p>
                <p><b>🕒 Note</b><br />Use the site to check availability and estimate cost before visiting.</p>
              </div>
              <a className="btn secondary" target="_blank" rel="noreferrer" href={mapsUrl}>Get directions</a>
            </div>
            <div className="map-frame card"><div className="map card map-live">
              <iframe title="CareFur location on Google Maps" src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div></div>
          </div>
        </section>
      </main>

      <footer className="enhanced-footer">
        <div className="shell footer footer-rich">
          <div>
            <div className="brand inverse"><img src="/carefur-logo.png" alt="CareFur" /><span>CareFur</span></div>
            <p>Pet hotel reservations, room availability, owner app access, and connected communication in one place.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href="#rooms">Rooms</a>
            <a href="#reservation">Reservation</a>
            <a href="#reviews">Reviews</a>
          </div>
          <div>
            <h4>Visit</h4>
            <span>{address}</span>
            <span>{phone}</span>
            <span>{email}</span>
            <a href={mapsUrl} target="_blank" rel="noreferrer">Open in Maps</a>
          </div>
          <div>
            <h4>Need help?</h4>
            <p>Open a live inquiry to chat with CareFur staff.</p>
            <button className="btn secondary footer-cta" onClick={() => setChatOpen(true)}>Open inquiries</button>
          </div>
        </div>
      </footer>

      <button className={`chat-launcher ${chatOpen ? 'open' : ''}`} onClick={() => setChatOpen((v) => !v)} aria-label="Open CareFur inquiry chat">
        {chatOpen ? '×' : '💬'}
        {!chatOpen && <span>Ask CareFur</span>}
      </button>

      {chatOpen && (
        <aside className="floating-chat" id="inquiries">
          <div className="floating-chat-head">
            <div>
              <b>CareFur Inquiries</b>
              <span>{activeInquiry ? `${activeInquiry.client_name} • ${activeInquiry.client_email}` : 'Realtime staff chat'}</span>
            </div>
            <button onClick={() => setChatOpen(false)} aria-label="Close chat">×</button>
          </div>

          {!supabase ? (
            <div className="chat-state"><b>Supabase is not configured.</b><p>Add your project URL and anon key to <code>.env.local</code>.</p></div>
          ) : chatLoading ? (
            <div className="chat-state">Loading…</div>
          ) : activeInquiry ? (
            <>
              <div className="floating-thread-meta">
                <div><b>{activeInquiry.subject}</b><span className={`status-dot ${activeInquiry.status}`}>{activeInquiry.status}</span></div>
                <button type="button" onClick={resetInquiry}>New inquiry</button>
              </div>
              <div className="floating-messages">
                {messages.length ? messages.map((m) => (
                  <div key={m.id} className={`bubble-wrap ${m.sender_type === 'staff' ? 'staff' : 'client'}`}>
                    <div className="bubble">{m.message}</div>
                    <small>{m.sender_type === 'staff' ? (m.sender_name || 'CareFur Staff') : (m.sender_name || 'You')}</small>
                  </div>
                )) : <div className="chat-state compact">No messages yet.</div>}
                <div ref={messageEndRef} />
              </div>
              {activeInquiry.status === 'closed' ? (
                <div className="chat-closed">This inquiry has been closed. Start a new inquiry if you still need help.</div>
              ) : (
                <form className="floating-composer" onSubmit={sendInquiry}>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message…" rows="2" />
                  <button aria-label="Send message">➤</button>
                </form>
              )}
              {chatError && <div className="chat-error chat-error-bottom">{chatError}</div>}
            </>
          ) : (
            <form className="new-inquiry-form" onSubmit={startInquiry}>
              <div className="quick-note">Enter your name and email, then CareFur staff can reply to your inquiry in this live thread.</div>
              <h3>Start a realtime chat with staff</h3>
              <label>Your name *<input name="client_name" value={newInquiryState.name} onChange={(e) => setNewInquiryState((prev) => ({ ...prev, name: e.target.value }))} required /></label>
              <label>Email *<input name="client_email" type="email" value={newInquiryState.email} onChange={(e) => setNewInquiryState((prev) => ({ ...prev, email: e.target.value }))} required /></label>
              <label>Subject *<input name="subject" value={newInquiryState.subject} onChange={(e) => setNewInquiryState((prev) => ({ ...prev, subject: e.target.value }))} placeholder="Reservation, room, policy…" required /></label>
              <label>Message *<textarea name="message" rows="5" placeholder="How can CareFur help?" required /></label>
              <div className="hero-actions chat-actions">
                <button className="btn primary" disabled={chatLoading}>{chatLoading ? 'Starting…' : 'Start chat'}</button>
              </div>
              {chatError && <div className="chat-error">{chatError}</div>}
            </form>
          )}
        </aside>
      )}
    </>
  )
}
