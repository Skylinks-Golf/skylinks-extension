Here's the complete script based on what I found by inspecting the live API. The app uses:

/private_api/teesheets — returns all tee time slots (with id, start_time, date, holes, blocked, free_slots, etc.)
/private_api/reservations — returns all reservations for the day (each with rounds[] containing full customer details)
localStorage['chronogolf.{clubId}.appState'] — stores courseId and organizationId (club_id) for the current session
Auth is handled automatically via browser session cookies


javascript/**
 * Skylinks Admin Chrome Extension
 * Export Tee Sheet Reservations for a given date to JSON
 *
 * Usage (inject into chronogolf.com page, or call from extension background/content script):
 *   exportTeeSheetReservations('2026-05-03');          // specific date
 *   exportTeeSheetReservations();                       // defaults to today
 *
 * Must be run while logged into https://www.chronogolf.com/admin
 */

async function exportTeeSheetReservations(dateStr) {
  // ── 1. Resolve date ──────────────────────────────────────────────────────────
  if (!dateStr) {
    const now = new Date();
    dateStr = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
  }

  // Basic format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Use YYYY-MM-DD.`);
  }

  // ── 2. Resolve club_id / course_id from app state ───────────────────────────
  // Chronogolf stores these in localStorage keyed by club ID
  let clubId, courseId;

  // Try to find the right localStorage key
  const lsMatch = Object.keys(localStorage).find(k => k.match(/^chronogolf\.\d+\.appState$/));
  if (lsMatch) {
    const appState = JSON.parse(localStorage.getItem(lsMatch));
    clubId   = appState.organizationId;
    courseId = appState.courseId;
  }

  // Fallback: parse club_id from the current URL hash  (#/clubs/2534/...)
  if (!clubId) {
    const urlMatch = window.location.href.match(/clubs\/(\d+)/);
    if (urlMatch) clubId = parseInt(urlMatch[1], 10);
  }

  if (!clubId || !courseId) {
    throw new Error(
      'Could not determine club_id / course_id. ' +
      'Make sure you are logged into the Chronogolf admin tee sheet page.'
    );
  }

  console.log(`[TeeSheetExport] Exporting: date=${dateStr}, club_id=${clubId}, course_id=${courseId}`);

  // ── 3. Fetch tee sheet slots (start_time lookup table) ──────────────────────
  const teesheetUrl =
    `https://www.chronogolf.com/private_api/teesheets` +
    `?course_id=${courseId}&date=${dateStr}&on=${dateStr}`;

  const teesheetResp = await fetch(teesheetUrl, { credentials: 'include' });
  if (!teesheetResp.ok) {
    throw new Error(`Tee sheet fetch failed: ${teesheetResp.status} ${teesheetResp.statusText}`);
  }
  const teesheetSlots = await teesheetResp.json();

  // Build a Map: teetime_id → slot data (for fast lookup when joining)
  const slotById = new Map(teesheetSlots.map(slot => [slot.id, slot]));

  // ── 4. Fetch reservations ───────────────────────────────────────────────────
  const reservationsUrl =
    `https://www.chronogolf.com/private_api/reservations` +
    `?course_id=${courseId}&date=${dateStr}&on=${dateStr}`;

  const reservationsResp = await fetch(reservationsUrl, { credentials: 'include' });
  if (!reservationsResp.ok) {
    throw new Error(`Reservations fetch failed: ${reservationsResp.status} ${reservationsResp.statusText}`);
  }
  const reservations = await reservationsResp.json();

  // ── 5. Join tee time info onto each reservation ─────────────────────────────
  const enrichedReservations = reservations.map(res => {
    const slot = slotById.get(res.teetime_id) || null;
    return {
      // Core reservation fields
      id:                res.id,
      booking_reference: res.booking_reference,
      state:             res.state,
      holes:             res.holes,
      source:            res.source,       // "club" | "online" | etc.
      medium:            res.medium,       // "proshop" | "website" | etc.
      made_online:       res.made_online,
      note:              res.note,
      online_note:       res.online_note,
      created_at:        res.created_at,
      updated_at:        res.updated_at,

      // Tee time info (joined from teesheet)
      tee_time: slot ? {
        id:         slot.id,
        start_time: slot.start_time,   // "HH:MM" e.g. "07:00"
        date:       slot.date,
        hole:       slot.hole,
        format:     slot.format,
        blocked:    slot.blocked,
        event_id:   slot.event_id,
        course:     slot.course,
      } : { id: res.teetime_id },

      // Players / rounds
      players: res.rounds.map(round => ({
        round_id:            round.id,
        state:               round.state,   // "reserved" | "checked_in" | etc.
        paid:                round.paid,
        requires_payment:    round.requires_payment,
        fully_refunded:      round.fully_refunded,
        affiliation_type_id: round.affiliation_type_id,
        raincheck_id:        round.raincheck_id,
        // Customer details (null for walk-ins stored as guests)
        customer: round.customer ? {
          id:        round.customer.id,
          first_name: round.customer.first_name,
          last_name:  round.customer.last_name,
          email:      round.customer.email,
          phone:      round.customer.phone,
          member_no:  round.customer.member_no,
          bag_number: round.customer.bag_number,
          ref:        round.customer.ref,
        } : null,
        // Guest name if no customer account
        guest: (round.guest && Object.keys(round.guest).length > 0) ? round.guest : null,
      })),

      // Tour operator if applicable
      tour_operator: res.tour_operator,
    };
  });

  // Sort by tee time start_time ascending
  enrichedReservations.sort((a, b) => {
    const tA = a.tee_time?.start_time || '';
    const tB = b.tee_time?.start_time || '';
    return tA.localeCompare(tB);
  });

  // ── 6. Build the export payload ─────────────────────────────────────────────
  const exportPayload = {
    export_meta: {
      exported_at:  new Date().toISOString(),
      date:         dateStr,
      club_id:      clubId,
      course_id:    courseId,
      course_name:  teesheetSlots[0]?.course?.name || 'Unknown',
      total_slots:  teesheetSlots.length,
      total_reservations: enrichedReservations.length,
      total_players: enrichedReservations.reduce((sum, r) => sum + r.players.length, 0),
    },
    reservations: enrichedReservations,
  };

  // ── 7. Download as JSON file ─────────────────────────────────────────────────
  const filename = `teesheet_${dateStr}_club${clubId}.json`;
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Clean up object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  console.log(`[TeeSheetExport] ✅ Downloaded "${filename}" — ${exportPayload.export_meta.total_reservations} reservations, ${exportPayload.export_meta.total_players} players`);
  return exportPayload.export_meta;
}

// ── Auto-run if you want a quick test ───────────────────────────────────────
// exportTeeSheetReservations('2026-05-03');

How to use it
As a content script (manifest.json → content_scripts): inject it on https://www.chronogolf.com/admin* and call exportTeeSheetReservations('2026-05-03') from your popup, options page, or background service worker via chrome.scripting.executeScript.
From the DevTools console (for quick testing): paste the whole script and run await exportTeeSheetReservations('2026-05-03').

What the export contains
Each JSON file includes an export_meta header (date, club, course, totals) and a reservations array sorted by tee time. Every reservation has:

Core booking info: booking_reference, state, holes, source, medium, made_online, timestamps
Tee time slot: start_time, date, hole, format, blocked, event_id
players[]: each player's state, paid, customer (name, email, phone, member number) or guest name if no account

Filename format: teesheet_YYYY-MM-DD_club2534.json

Key API endpoints discovered
EndpointPurpose/private_api/teesheets?course_id=&date=&on=All tee time slots (times, holes, format)/private_api/reservations?course_id=&date=&on=All reservations + player/customer datalocalStorage['chronogolf.{clubId}.appState']Gets courseId & organizationId automatically