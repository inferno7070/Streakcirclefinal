// =============================================================
// rt.js: Socket.IO helper.
// Lets routes and core logic send live events to one user (u:<id>) or a whole circle (c:<id>).
// =============================================================
// Small Socket.IO holder so routes and domain logic can publish events without
// importing the HTTP server and creating a circular dependency.
let io = null;
export const setIO = (x) => { io = x; };
// emitUser / emitCircle: send an event to one user or to everyone in a circle
export const emitUser = (id, evt, data) => io?.to('u:' + id).emit(evt, data);
export const emitCircle = (id, evt, data) => io?.to('c:' + id).emit(evt, data);
export const joinCircleRoom = (uid, cid) => io?.in('u:' + uid).socketsJoin('c:' + cid);
export const leaveCircleRoom = (uid, cid) => io?.in('u:' + uid).socketsLeave('c:' + cid);
// Like emitUser, but reports whether anyone was online to receive it
export async function emitUserIfOnline(id, evt, data) {
  if (!io) return false;
  const room = 'u:' + id;
  const sockets = await io.in(room).fetchSockets();
  if (!sockets.length) return false;
  io.to(room).emit(evt, data);
  return true;
}
