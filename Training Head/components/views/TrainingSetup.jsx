"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { Seg } from "../ui";
import { ClassesCard } from "./ClassesCard";
import Students from "./Students";
import ShareWithHod from "./ShareWithHod";

// Training Head home for everything that is not attendance: classes, students and sharing.
export default function TrainingSetup() {
  const [section, setSection] = useState("classes");
  const { currentClass } = useStaff();
  return (
    <>
      <div className="card" style={{ paddingBottom: 12 }}>
        <h3>Classes, Students &amp; Sharing</h3>
        <p className="hint">Branch names, semesters and sections must match the HOD's classes so the Master sheet can line them up.</p>
        <Seg value={section} onChange={setSection} options={[["classes", "Classes"], ["students", "Students"], ["share", "Share with HOD"]]} />
      </div>
      {section === "classes" && <ClassesCard defaultBranch="" />}
      {section === "students" && (currentClass ? <Students /> : <div className="card empty">Create a class first (Classes).</div>)}
      {section === "share" && <ShareWithHod />}
    </>
  );
}
