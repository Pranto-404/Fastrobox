import type { DictKey } from "@/lib/i18n/dict";
import type { Role } from "@/lib/auth/session";

export interface NavItem {
  href: string;
  key: DictKey;
  icon: string;
  roles: Role[];
  group?: "admin";
}

/** Single source of truth for navigation; pages enforce the same roles server-side. */
export const NAV: NavItem[] = [
  { href: "/dashboard", key: "nav.overview", icon: "LayoutDashboard", roles: ["admin", "teacher"] },
  { href: "/alerts", key: "nav.alerts", icon: "Bell", roles: ["admin", "teacher"] },
  { href: "/attendance", key: "nav.attendance", icon: "ClipboardCheck", roles: ["admin", "teacher"] },
  { href: "/history", key: "nav.history", icon: "LineChart", roles: ["admin", "teacher"] },
  { href: "/reports", key: "nav.reports", icon: "FileBarChart", roles: ["admin", "teacher"] },
  { href: "/assistant", key: "nav.assistant", icon: "Bot", roles: ["admin", "teacher"] },
  { href: "/weather", key: "nav.weather", icon: "CloudSun", roles: ["admin", "teacher", "student", "guardian"] },
  { href: "/me", key: "nav.myAttendance", icon: "ClipboardCheck", roles: ["student"] },
  { href: "/guardian", key: "nav.children", icon: "Users", roles: ["guardian"] },
  { href: "/admin/users", key: "nav.users", icon: "UserCog", roles: ["admin"], group: "admin" },
  { href: "/admin/classrooms", key: "nav.classrooms", icon: "School", roles: ["admin"], group: "admin" },
  { href: "/admin/devices", key: "nav.devices", icon: "Cpu", roles: ["admin"], group: "admin" },
  { href: "/admin/students", key: "nav.students", icon: "GraduationCap", roles: ["admin"], group: "admin" },
  { href: "/admin/cards", key: "nav.cards", icon: "CreditCard", roles: ["admin"], group: "admin" },
  { href: "/admin/schedules", key: "nav.schedules", icon: "CalendarClock", roles: ["admin"], group: "admin" },
  { href: "/admin/settings", key: "nav.settings", icon: "SlidersHorizontal", roles: ["admin"], group: "admin" },
  { href: "/admin/firmware", key: "nav.firmware", icon: "HardDriveUpload", roles: ["admin"], group: "admin" },
  { href: "/admin/login-history", key: "nav.loginHistory", icon: "History", roles: ["admin"], group: "admin" },
];

export function homeFor(role: Role) {
  return role === "student" ? "/me" : role === "guardian" ? "/guardian" : "/dashboard";
}
