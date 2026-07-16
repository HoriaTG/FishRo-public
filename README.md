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

<img width="1865" height="953" alt="image" src="https://github.com/user-attachments/assets/16f503bb-1bdb-47e6-b786-57978985a145" /><br>

In the **My Orders** section, users can track the status of their orders. Each order is assigned a unique order number, and users can view the date and time when the order was placed, as well as the products included in it.

An order can have one of four statuses: **Submitted**, **Confirmed**, **In Transit**, and **Delivered**. Immediately after an order is placed, its status is set to **Submitted**. The order must then be reviewed and confirmed by an administrator, at which point its status changes from **Submitted** to **Confirmed**. Once the order has been handed over to the courier, its status changes to **In Transit**. Finally, after the order has been successfully delivered, its status becomes **Delivered**, indicating that the order has been completed.

<img width="1870" height="955" alt="image" src="https://github.com/user-attachments/assets/acc2aef7-dc7d-4ba7-a8fc-8df7ab9e2db4" /><br>

If the user wishes to view one of his orders in greater detail, he can click on the desired order, and a window containing all the order's information will appear on the screen.

<img width="1867" height="953" alt="image" src="https://github.com/user-attachments/assets/50e0ec57-3ad3-4c24-916e-c1f10dc4d17e" /><br>

In the **Favorites** section, users can view all the products they have marked as favorites.

<img width="1868" height="956" alt="image" src="https://github.com/user-attachments/assets/5d0cf84a-dfc0-4f0e-b899-26ad16e4d775" /><br>

In the **Stock Wishlist** section, users can view the products they wanted to purchase but that were out of stock at the time. When one of these products becomes available again, users who have added it to their wishlist will receive a notification informing them that the product is back in stock.

<img width="1870" height="950" alt="image" src="https://github.com/user-attachments/assets/4d962cbc-74d4-413f-96f2-084bf85245bc" /><br>

In the **My Tickets** section, users can contact the support team to resolve issues of any kind. To prevent spam, a new support ticket can only be created once every 12 hours, and the remaining cooldown time is always visible to the user.

To open a ticket, the user must select a category (**Order**, **Product**, **Payment**, **Delivery**, or **Other**) and describe the issue in the corresponding text box. After clicking the **Open Ticket** button, the newly created ticket will appear on the right side of the page.


<img width="1867" height="957" alt="image" src="https://github.com/user-attachments/assets/7528522f-d2c4-4f4c-9d3b-1ce29c6daca0" /><br>

To access the conversation associated with a support ticket, the user must click on the desired ticket. A separate page will open, where the user can send additional messages if necessary or reply to messages received from the support team.

The ticket will remain open for as long as needed until the issue has been resolved. A ticket is automatically closed if no messages have been exchanged for five consecutive days. Additionally, a support team representative may close the ticket manually at any time once the issue is considered resolved.

<img width="1865" height="952" alt="image" src="https://github.com/user-attachments/assets/107e878f-41e3-4e26-92b2-ac0ee003cb4e" /><br>

In the **FishBot Conversations** section, users can access the history of their conversations with the website's support chatbot, **FishBot**.

<img width="1862" height="956" alt="image" src="https://github.com/user-attachments/assets/e1bc8647-7049-4e65-8168-02062da5d7a4" /><br>

In the **Notification History** section, users can view all the notifications they have received over time. Notifications are sent in the following situations: when the status of an order changes, when the user receives a reply to a support ticket, or when an administrator intentionally sends a notification, such as a gift voucher or a general announcement.

<img width="1865" height="950" alt="image" src="https://github.com/user-attachments/assets/27f54901-a677-445c-b6b0-55b888b2c38a" /><br>

In the **Statistics** section, users can view a well-organized overview of their yearly activity. For each year, they can see the total number of orders placed, the number of products purchased, the total amount spent on orders, the amount of money saved through vouchers, and the number of vouchers used. To provide a clear visualization of user activity throughout the year, the statistics are displayed using a monthly chart.

<img width="1868" height="952" alt="image" src="https://github.com/user-attachments/assets/e99296cc-1bd0-4148-b4d2-d160311c660d" /><br>

The final section, **Change Password**, allows users to update their account password whenever necessary. For security reasons, users must first enter their current password before setting a new one. The new password must be entered twice to prevent accidental password changes caused by typing errors.

<img width="1870" height="950" alt="image" src="https://github.com/user-attachments/assets/8c0db19d-7491-4e12-bf25-3af5311cc92a" />

### FishBot

One of the most interesting features of the project is **FishBot**, a virtual AI assistant available 24/7. FishBot is trained to answer questions related to the website and its services. When users open the chat with FishBot, they have two options: they can either select one of the predefined quick questions or type their own question. FishBot is capable of answering a wide range of questions; however, its responses always prioritize recommendations and products available in the store.


<p align="center">
  <img src="https://github.com/user-attachments/assets/ab9a87ec-0fb7-4726-bdd9-36e7d5e80cfa" width="270" alt="image" />
  <img src="https://github.com/user-attachments/assets/b6e622c9-dc9c-43ac-b685-5ce04fdb4270" width="270" alt="image" />
  <img src="https://github.com/user-attachments/assets/c5502ebe-a4ad-4868-a2ea-f2e66f12c4a0" width="270" alt="image" />
</p>



</details>
