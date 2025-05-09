const API   = 'https://seniorproject-jkm4.onrender.com';
const token = localStorage.getItem('token');
const tbl   = document.querySelector('#eventsTable tbody');
const form  = document.getElementById('eventForm');

// helper to convert "14:30" → "2:30 PM"
function to12Hour(time24) {
  let [h, m] = time24.split(":").map(s => parseInt(s, 10));
  const suffix = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;       // map 0→12, 13→1, etc.
  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}

async function loadEvents() {
  const res = await fetch(`${API}/api/events?date=ALL`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) {
    console.error("Failed to load events:", await res.text());
    tbl.innerHTML = `<tr><td colspan="4">Error loading events</td></tr>`;
    return;
  }
  const { events } = await res.json();

  tbl.innerHTML = events.map(ev => `
    <tr>
      <td>${new Date(ev.date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</td>
      <td>
        ${to12Hour(ev.startTime)} &ndash; ${to12Hour(ev.endTime)}
      </td>
      <td>${ev.title}</td>
      <td><button data-id="${ev._id}" class="delete">×</button></td>
    </tr>
  `).join('');
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    date:      form.date.value,
    startTime: form.startTime.value,
    endTime:   form.endTime.value,
    title:     form.title.value
  };
  await fetch(`${API}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });
  form.reset();
  loadEvents();
});

tbl.addEventListener('click', async e => {
  if (!e.target.matches('.delete')) return;
  const id = e.target.dataset.id;
  await fetch(`${API}/api/events/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  loadEvents();
});

// initial load
loadEvents();