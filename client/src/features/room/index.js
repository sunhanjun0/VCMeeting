// Room feature (client) — owns the 'room' state slice and keeps the participant
// list / roles in sync from network bus events. UI lives in HomeForm/RoomView;
// imperative flows live in actions.js. Talks only via bus + store + net (§13).

const INITIAL = {
  roomId: null,
  sessionId: null,
  role: null,
  token: null,
  participants: [],
  latestState: null,
  content: null,
  status: 'idle', // idle | joined
  error: null
};

function upsert(list, participant) {
  const i = list.findIndex((p) => p.sessionId === participant.sessionId);
  if (i === -1) return [...list, participant];
  const next = list.slice();
  next[i] = { ...next[i], ...participant };
  return next;
}

export function createRoomModule() {
  return {
    name: 'room',
    init(ctx) {
      const { bus, store, slice } = ctx;
      store.defineSlice('room', INITIAL);

      bus.on('participant:joined', (p) => {
        slice.set((s) => ({ participants: upsert(s.participants, p) }));
      });

      bus.on('participant:left', ({ sessionId }) => {
        slice.set((s) => ({ participants: s.participants.filter((p) => p.sessionId !== sessionId) }));
      });

      bus.on('participant:updated', (patch) => {
        slice.set((s) => ({
          participants: s.participants.map((p) =>
            p.sessionId === patch.sessionId ? { ...p, ...patch } : p
          )
        }));
      });

      bus.on('host:changed', ({ hostSessionId }) => {
        slice.set((s) => ({
          role: s.sessionId === hostSessionId ? 'host' : 'guest',
          participants: s.participants.map((p) => ({
            ...p,
            role: p.sessionId === hostSessionId ? 'host' : 'guest'
          }))
        }));
      });
    }
  };
}
