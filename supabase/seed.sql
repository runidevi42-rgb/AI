insert into college_info (title, content, category)
select seed.title, seed.content, seed.category
from (values
  ('Campus hours','The main campus is open Monday to Saturday from 7:00 AM to 8:00 PM.','campus'),
  ('Library hours','The central library is open Monday to Saturday from 8:00 AM to 7:00 PM.','library'),
  ('Placement cell','The Training and Placement Cell is located in Admin Block, Room 204.','placement')
) as seed(title, content, category)
where not exists (select 1 from college_info existing where existing.title = seed.title);

insert into faqs (question, answer, category) values
  ('How do I request a bonafide certificate?','Submit the certificate request form at the Academic Office with your student ID.','academic'),
  ('Where is the lost and found?','Lost and found is managed by Campus Security at the main gate.','campus');

insert into emergency_contacts
  (contact_name, phone_number, role_or_service, emergency_type, description, priority, active, contact_type)
select seed.contact_name, seed.phone_number, seed.role_or_service, seed.emergency_type, seed.description, seed.priority, true, 'public_service'
from (values
  ('National Emergency','112','Emergency service','General emergency','Use for an immediate emergency requiring public assistance.',1),
  ('Police','100','Police service','Campus safety issue','Use for an immediate police or serious safety emergency.',2),
  ('Fire','101','Fire service','Fire emergency','Use for a fire or immediate fire-safety emergency.',3),
  ('Ambulance','102','Ambulance service','Medical emergency','Use when urgent ambulance assistance is required.',4)
) as seed(contact_name, phone_number, role_or_service, emergency_type, description, priority)
where not exists (
  select 1 from emergency_contacts existing
  where existing.contact_name = seed.contact_name and existing.phone_number = seed.phone_number
);
