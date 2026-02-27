export type Role = "citizen" | "authority" | "contractor";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Grievance {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_mobile?: string | null;
  location: string;
  priority: "low" | "medium" | "high" | "urgent";
  status:
    | "submitted"
    | "under_review"
    | "assigned"
    | "in_progress"
    | "awaiting_confirmation"
    | "resolved"
    | "closed"
    | "escalated"
    | "reopened";
  complaint_status?: "pending" | "accepted" | "in_progress" | "closed";
  images_json?: string | null;
  resolution_image_url?: string | null;
  citizen_name?: string;
  citizen_email?: string;
  citizen_phone?: string | null;
  assigned_department?: string | null;
  created_at?: string;
  latitude: number | null;
  longitude: number | null;
  category_name?: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface ContractorDemoAccount {
  id: number;
  name: string;
  email: string;
  password: string;
  active_complaints: number;
  closed_complaints: number;
}
