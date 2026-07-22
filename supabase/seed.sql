insert into college_info (key, title, content, category) values
  ('campus-hours','Campus hours','The main campus is open Monday to Saturday from 7:00 AM to 8:00 PM.','campus'),
  ('library-hours','Library hours','The central library is open Monday to Saturday from 8:00 AM to 7:00 PM.','library'),
  ('placement-cell','Placement cell','The Training and Placement Cell is located in Admin Block, Room 204.','placement')
on conflict (key) do nothing;

insert into faqs (question, answer, category) values
  ('How do I request a bonafide certificate?','Submit the certificate request form at the Academic Office with your student ID.','academic'),
  ('Where is the lost and found?','Lost and found is managed by Campus Security at the main gate.','campus');

insert into emergency_contacts (name, role, phone, available_hours, priority) values
  ('Campus Security','Security Desk','9111111111','24/7',1),
  ('College Health Centre','Medical Support','9222222222','8:00 AM - 8:00 PM',2),
  ('Anti-Ragging Helpline','Student Safety','18001805522','24/7',3);
