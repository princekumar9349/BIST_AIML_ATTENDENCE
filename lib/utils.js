export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function timeAgo(ts) {
  if (!ts) return "Just now";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 30) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export const errorText = (e) => (e && e.message ? e.message : "Something went wrong");

export const ROLE = { HOD: "HOD", TEACHER: "TEACHER", STUDENT: "STUDENT", TRAINING_HEAD: "TRAINING_HEAD", TRAINER: "TRAINER" };

// Which roles work class-by-class through the class selector (everyone except faculty and students).
export const isClassScoped = (role) => role === "HOD" || role === "TRAINING_HEAD" || role === "TRAINER";
export const isTrainingRole = (role) => role === "TRAINING_HEAD" || role === "TRAINER";
