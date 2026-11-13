import { z } from "zod";
import { ApiError } from "./http";
import {
  createClassroom, createSchedule, createStudent, createUser, deleteCard, deleteStudent, registerCard,
  updateCard, updateClassroom, updateSchedule, updateStudent, updateUser,
} from "./admin";
import { registerDevice, rotateDeviceToken } from "./devices";
import { db } from "./db";
import { audit } from "./audit";

type Ctx = { actor: string; ip: string | null };
type Create = (body: unknown, c: Ctx) => Promise<unknown>;
type Update = (id: string, body: unknown, c: Ctx) => Promise<unknown>;
type Remove = (id: string, c: Ctx) => Promise<unknown>;

const deviceUpdate = z.strictObject({
  action: z.enum(["rotate_token"]).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  online_threshold_s: z.coerce.number().int().min(3).max(30).optional(),
});

export const ADMIN_RESOURCES: Record<string, { create?: Create; update?: Update; remove?: Remove }> = {
  users: {
    create: (b, c) => createUser(b, c.actor, c.ip),
    update: (id, b, c) => updateUser(id, b, c.actor, c.ip),
  },
  classrooms: {
    create: (b, c) => createClassroom(b, c.actor, c.ip),
    update: (id, b, c) => updateClassroom(id, b, c.actor, c.ip),
  },
  students: {
    create: (b, c) => createStudent(b, c.actor, c.ip),
    update: (id, b, c) => updateStudent(id, b, c.actor, c.ip),
    remove: (id, c) => deleteStudent(id, c.actor, c.ip),
  },
  cards: {
    create: (b, c) => registerCard(b, c.actor, c.ip),
    update: (id, b, c) => updateCard(id, b, c.actor, c.ip),
    remove: (id, c) => deleteCard(id, c.actor, c.ip),
  },
  schedules: {
    create: (b, c) => createSchedule(b, c.actor, c.ip),
    update: (id, b, c) => updateSchedule(id, b, c.actor, c.ip),
    remove: async (id, c) => {
      const r = await db()`delete from class_schedules where id = ${z.uuid().parse(id)} returning id`;
      if (!r.length) throw new ApiError(404, "not_found", "Schedule not found");
      await audit(c.actor, "schedule.delete", { type: "schedule", id }, {}, c.ip);
    },
  },
  devices: {
    create: async (b, c) => {
      const r = await registerDevice(b as never, c.actor, c.ip);
      return { id: r.id, device_uid: r.device_uid, token: r.token };
    },
    update: async (id, b, c) => {
      const u = deviceUpdate.parse(b);
      z.uuid().parse(id);
      if (u.action === "rotate_token") return { token: await rotateDeviceToken(id, c.actor, c.ip) };
      const r = await db()`update devices set name = coalesce(${u.name ?? null}, name),
                                    online_threshold_s = coalesce(${u.online_threshold_s ?? null}, online_threshold_s)
                            where id = ${id} returning id`;
      if (!r.length) throw new ApiError(404, "not_found", "Device not found");
      await audit(c.actor, "device.update", { type: "device", id }, u, c.ip);
      return {};
    },
  },
};
