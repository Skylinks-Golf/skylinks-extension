(function TeeSheetExportUI() {

  const BASE = 'https://www.chronogolf.com';

  const { escHtml, makeLogger, createModal, apiClient, download, runReport } = window.SkylinksUtils;
  const log = makeLogger('Tee Sheet Export');

  const today = new Date().toISOString().split('T')[0];

  const api = apiClient({ baseUrl: BASE, auth: 'cookie' });

  const modal = createModal({
    id: 'tse',
    title: 'Export Tee Sheet',
    emoji: '⛳',
    description: 'Downloads all reservations for a given date as a JSON file, including tee times, player details, and booking metadata.',
    fields: [
      { id: 'date', type: 'date', label: 'Date', value: today },
    ],
    runLabel: 'Export JSON',
  });

  function resolveClubIds() {
    const lsKey = Object.keys(localStorage).find(k => /^chronogolf\.\d+\.appState$/.test(k));
    if (lsKey) {
      const state = JSON.parse(localStorage.getItem(lsKey));
      if (state.organizationId && state.courseId) {
        return { clubId: state.organizationId, courseId: state.courseId };
      }
    }
    const urlMatch = window.location.href.match(/clubs\/(\d+)/);
    if (urlMatch) {
      throw new Error('Found club_id from URL but courseId is unavailable. Navigate to the tee sheet page and try again.');
    }
    throw new Error('Could not determine club_id / course_id. Navigate to the Chronogolf admin tee sheet page and try again.');
  }

  function jsonButton({ data, filename }) {
    const theme = window.SkylinksUtils.theme;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.textContent = filename;
    a.href = blobUrl;
    a.download = filename;
    a.style.cssText = `background:${theme.color.brand};color:${theme.color.brandText};padding:9px 18px;border-radius:${theme.radius.pill};font-weight:700;text-decoration:none;display:inline-block;cursor:pointer;font-size:0.9rem;`;
    a.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(blobUrl), 10000));
    return a;
  }

  runReport({
    modal,

    validate({ date }) {
      if (!date) return 'Please select a date.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date must be in YYYY-MM-DD format.';
    },

    async fetch({ date }, ctx) {
      const { clubId, courseId } = resolveClubIds();
      log(`Exporting date=${date}, club_id=${clubId}, course_id=${courseId}`);
      ctx.setStatus('Fetching tee sheet and reservations…');
      ctx.setProgress(20);

      const query = { course_id: courseId, date, on: date };
      const [slots, reservations] = await Promise.all([
        api.get('/private_api/teesheets', { query }),
        api.get('/private_api/reservations', { query }),
      ]);

      ctx.setProgress(80);
      return { slots, reservations, clubId, courseId };
    },

    process({ slots, reservations, clubId, courseId }, { date }) {
      const slotById = new Map(slots.map(s => [s.id, s]));

      const enriched = reservations.map(res => {
        const slot = slotById.get(res.teetime_id) || null;
        return {
          id:                res.id,
          booking_reference: res.booking_reference,
          state:             res.state,
          holes:             res.holes,
          source:            res.source,
          medium:            res.medium,
          made_online:       res.made_online,
          note:              res.note,
          online_note:       res.online_note,
          created_at:        res.created_at,
          updated_at:        res.updated_at,
          tee_time: slot ? {
            id:         slot.id,
            start_time: slot.start_time,
            date:       slot.date,
            hole:       slot.hole,
            format:     slot.format,
            blocked:    slot.blocked,
            event_id:   slot.event_id,
            course:     slot.course,
          } : { id: res.teetime_id },
          players: res.rounds.map(round => ({
            round_id:            round.id,
            state:               round.state,
            paid:                round.paid,
            requires_payment:    round.requires_payment,
            fully_refunded:      round.fully_refunded,
            affiliation_type_id: round.affiliation_type_id,
            raincheck_id:        round.raincheck_id,
            customer: round.customer ? {
              id:         round.customer.id,
              first_name: round.customer.first_name,
              last_name:  round.customer.last_name,
              email:      round.customer.email,
              phone:      round.customer.phone,
              member_no:  round.customer.member_no,
              bag_number: round.customer.bag_number,
              ref:        round.customer.ref,
            } : null,
            guest: (round.guest && Object.keys(round.guest).length > 0) ? round.guest : null,
          })),
          tour_operator: res.tour_operator,
        };
      });

      enriched.sort((a, b) => (a.tee_time?.start_time || '').localeCompare(b.tee_time?.start_time || ''));

      return {
        export_meta: {
          exported_at:         new Date().toISOString(),
          date,
          club_id:             clubId,
          course_id:           courseId,
          course_name:         slots[0]?.course?.name || 'Unknown',
          total_slots:         slots.length,
          total_reservations:  enriched.length,
          total_players:       enriched.reduce((sum, r) => sum + r.players.length, 0),
        },
        reservations: enriched,
      };
    },

    render(payload, { date }, modalHandle) {
      const { export_meta: meta } = payload;
      const filename = `teesheet_${date}_club${meta.club_id}.json`;

      log(`Downloaded "${filename}" — ${meta.total_reservations} reservations, ${meta.total_players} players`);

      const dlBtn = jsonButton({ data: payload, filename });

      const summary = document.createElement('div');
      const theme = window.SkylinksUtils.theme;
      summary.style.cssText = `font-size:0.875rem;color:${theme.color.muted};margin-bottom:10px;`;
      summary.innerHTML =
        `${escHtml(meta.course_name)} &middot; ` +
        `<strong>${meta.total_reservations}</strong> reservations &middot; ` +
        `<strong>${meta.total_players}</strong> players`;

      const wrap = document.createElement('div');
      wrap.appendChild(summary);
      wrap.appendChild(dlBtn);

      modalHandle.setStatus('Export ready.', 'success');
      modalHandle.setProgress(100);
      modalHandle.showResult(wrap);
    },
  });

})();
