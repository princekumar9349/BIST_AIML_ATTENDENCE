import TrainingReport from "./views/TrainingReport";
import Mark from "./views/Mark";
import Absent from "./views/Absent";
import Subjects from "./views/Subjects";
import Trainers from "./views/Trainers";
import TrainingSetup from "./views/TrainingSetup";
import Profile from "./views/Profile";

// Training Head deployment: the Training Head owns classes, students, training sessions and trainer
// access; trainers only mark training attendance for the branches they were given.
export const REGISTRY = {
  views: {
    report: TrainingReport, mark: Mark, absent: Absent, subjects: Subjects,
    trainers: Trainers, setup: TrainingSetup, profile: Profile,
  },
  roles: {
    TRAINING_HEAD: {
      landing: "report",
      nav: [["report", "Training"], ["mark", "Attend."], ["absent", "Absent"], ["subjects", "Sessions"], ["trainers", "Trainers"], ["setup", "Classes"]],
      icons: { trainers: "students", setup: "setup" },
      classBarTabs: ["report", "mark", "absent", "subjects", "setup"],
      prefetch: ["listSubjects", "getTrainingSummary"],
      subjectTypes: ["TRAINING"],
      subtitle: (u) => `Training Head • ${u.username}`,
      profileLine: (u) => `Training Head (${u.username})`,
    },
    TRAINER: {
      landing: "mark",
      nav: [["mark", "Attendance"], ["report", "Training"], ["absent", "Absentees"], ["profile", "Profile"]],
      classBarTabs: ["report", "mark", "absent"],
      prefetch: ["listSubjects", "getTrainingSummary"],
      subjectTypes: [],
      subtitle: (u) => `Trainer • ${u.username}`,
      profileLine: (u) => `Trainer (${u.username})`,
    },
  },
};
