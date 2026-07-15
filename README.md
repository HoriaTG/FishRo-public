# FishRo

<details>
<summary><strong>Description</strong></summary>

FishRo is a full-stack web application dedicated to fishing enthusiasts. The platform allows users to browse products, manage their shopping cart, place orders, submit product reviews, communicate with moderators through a ticketing system, and receive assistance from an integrated AI chatbot.

The application also includes an administrative dashboard where moderators and administrators can manage products, orders, support tickets, and other platform resources through a role-based access system.

</details>

---

<details>
<summary><strong>Technologies</strong></summary>

### Frontend

- React
- Vite
- React Router DOM
- CSS
- Fetch API
- Local Storage

### Backend

- Python
- FastAPI
- SQLAlchemy
- SQLite
- Pydantic
- Uvicorn
- python-jose
- Passlib
- bcrypt
- python-dotenv
- Groq API

### Technical Features

- JWT Authentication
- Role-Based Access Control (User, Moderator, Admin)
- Administrative Dashboard
- Product Management
- Shopping Cart
- Order Management
- Product Reviews & Ratings
- Support Ticket System
- AI Chatbot Integration
- Environment Variable Configuration
- Configurable CORS
- Local Image Upload & Management

### Security

- JWT Authentication
- Password Hashing (bcrypt)
- Role-Based Authorization
- Environment Variables

</details>

---

<details>
<summary><strong>Demo</strong></summary>

### Home Page

When someone visits the website, they are welcomed by the Home page, which serves as the main landing page. It features engaging images and informative content that highlight what the website offers: a wide variety of products, fast delivery, efficient communication, and reliable, friendly customer support.

<img width="1872" height="952" alt="image" src="https://github.com/user-attachments/assets/b999528f-325e-4d77-834d-063c03d8f753" />

### Store

At this point, users have two available options: they can either create a new account or log in to an existing one, or they can choose to enter the store directly. If they decide to access the store without logging in, they will be redirected to the Products page. In addition to displaying the available products, this page includes a search bar for filtering products by name, category-based filters, and a price filter.

<img width="1856" height="955" alt="image" src="https://github.com/user-attachments/assets/a1fd456e-165b-419c-a601-ec3a66532da3" />

### Register 

If the user chooses to create a new account, he can click the **Register** button, which opens a registration window on the current page while blurring the background. The email address must be in a valid email format and be unique, while the username must also be unique and different from all existing usernames stored in the database.

<img width="1860" height="946" alt="image" src="https://github.com/user-attachments/assets/0debfb9b-885d-494e-be92-4b37ed12fbb3" />

### Login 

If the user chooses to log in to an existing account, the same window used for registration is displayed. The user must enter the account's email address and password. If the password is incorrect or the email address is not found in the database, the user will not be able to log in.

<img width="1852" height="943" alt="image" src="https://github.com/user-attachments/assets/7d6719b5-c62d-44e2-8d8b-4e0f526fa749" /><br>

After logging in, the **Login** and **Register** buttons disappear and are replaced by a new button displaying the user's account information, along with a button that provides access to the user's most recent notifications.

<img width="377" height="163" alt="image" src="https://github.com/user-attachments/assets/5974d336-a57a-4474-886b-d5ace7c5bbdd" />
<img width="376" height="197" alt="image" src="https://github.com/user-attachments/assets/326fc463-447c-44ab-81b4-931b6f398eca" />

### Account Page

On the **My Account** page, users have access to a wide range of useful information and features related to their account. For this reason, creating an account on the website is highly recommended. The first available section is **Account Details**, where users can upload a profile picture and enter their full name, phone number, delivery address, city, county, and postal code. This information is stored in the database and is automatically retrieved whenever a new order is placed.

<img width="1865" height="953" alt="image" src="https://github.com/user-attachments/assets/16f503bb-1bdb-47e6-b786-57978985a145" />

</details>
