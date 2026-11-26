// =============================================================
// socket.js: Socket.IO server. Checks the login token, then puts each user in
// their own room (u:<id>) and their circle's room (c:<id>) so events reach the right people.
// =============================================================
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { setIO } from './emit.js';

export function attachSocketServer(httpServer, origin) {
  const io = new Server(httpServer, { cors: { origin } });
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      if (!decoded?.id || !(await User.exists({ _id: decoded.id }))) return next(new Error('unauthorized'));
      socket.uid = String(decoded.id);
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', async (socket) => {
    socket.join('u:' + socket.uid);
    const u = await User.findById(socket.uid).select('circle').lean();
    if (u?.circle) socket.join('c:' + u.circle);
  });
  return io;
}
