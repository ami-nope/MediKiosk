
cd Backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

cd Frontend                       
npm run dev    

http://localhost:5174/#/kiosk
http://localhost:5174/#/dashboard
http://localhost:5174/#/admin


make the admin portal credential 




delete patient records after a certain period of time or upon request to comply with data retention policies and regulations.

make a online appointment scheduling system for patients to book appointments with doctors and receive reminders.


show department and doctor availability in the scheduling system to avoid conflicts and ensure efficient scheduling. 


at first tell patient to enter their ID and autofill if stored in database if available, otherwise prompt for new registration and store the information securely in the database. 
and make sure to validate the information provided by the patient to avoid errors and ensure accuracy.


at the start ask the patient to enter the symptoms and reason for visit, and use AI to suggest possible departments or doctors based on the input.and show predicted time for the appointment based on the doctor's availability and workload.


use kiims and some odia doctor's examples for bias with judge (idk sounds like ass)
