export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  slack_team?: string;
  admin: boolean;
}
export interface Email {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduled_at: string;
  sent_at?: string;
  preview_url?: string;
}
