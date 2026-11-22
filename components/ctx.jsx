"use client";
import { createContext, useContext } from "react";

// Shared state for every signed-in screen: who is signed in, which class is selected, and settings.
export const StaffCtx = createContext(null);
export const useStaff = () => useContext(StaffCtx);
