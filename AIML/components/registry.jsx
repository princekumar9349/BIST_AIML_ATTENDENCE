import Report from "./views/Report";
import Mark from "./views/Mark";
import Absent from "./views/Absent";
import Students from "./views/Students";
import Subjects from "./views/Subjects";
import Setup from "./views/Setup";
import Profile from "./views/Profile";
import StudentDashboard from "./views/StudentDashboard";
import { DEPT_NAME } from "../lib/config";

// HOD deployment: roles, bottom navigation, which tabs show the class selector, and the screens.
export const REGISTRY = {
  views: {
    report: Report, mark: Mark, absent: Absent, students: Students, subjects: Subjects,
    setup: Setup, profile: Profile, myatt: StudentDashboard,
  },
  roles: {
    HOD: {
      landing: "report",
      nav: [["report", "Master"], ["mark", "Attend."], ["absent", "Absent"], ["students", "Students"], ["subjects", "Subjects"], ["setup", "Setup"], ["profile", "Settings"]],
      classBarTabs: ["report", "students", "subjects", "absent", "mark"],
      prefetch: ["listSubjects", "listStudents"],
      subjectTypes: ["CLASS", "EXTRA"],
      subtitle: () => `HOD • ${DEPT_NAME}`,
      profileLine: () => "Head of Department (HOD) — AIML",
    },
    TEACHER: {
      landing: "mark",
      nav: [["mark", "Attendance"], ["absent", "Absentees"], ["students", "Students"], ["profile", "Profile"]],
      classBarTabs: ["students", "absent"],
      prefetch: [],
      subjectTypes: [],
      subtitle: (u) => `Faculty • @${u.username}`,
      profileLine: (u) => `Faculty Member (@${u.username}) — AIML`,
    },
    STUDENT: {
      landing: "myatt",
      nav: [["myatt", "My Attendance"], ["profile", "Profile & Info"]],
      classBarTabs: [],
      prefetch: [],
      subjectTypes: [],
      subtitle: (u) => `${u.username} • ${u.label}`,
      profileLine: (u) => `Student (${u.username}) • ${u.label}`,
    },
  },
};
