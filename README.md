## Overview
This project is a web-based application for a pharmacy named "Nhà thuốc A Long". The application provides various functionalities for different user roles, such as admin, seller, and buyer. It allows users to manage products (drugs), view product details, and handle user authentication and management.

## Prerequisites

1. **Web Server**: A web server is required to serve the HTML files and handle API requests. You can use a local server like XAMPP, WAMP, or a Node.js server.
2. **Browser**: A modern web browser like Chrome, Firefox, or Edge is recommended for optimal performance.

## File Structure

- **HTML Files**:
  - **`admin.html`**: Admin interface for managing users.
  - **`main.html`**: Main interface for buyers to browse and search for drugs.
  - **`seller.html`**: Interface for sellers to manage drug inventory.
  - **`thuoc.html`**: Drug detail page where users can view and purchase drugs.

- **JavaScript Files**:
  - **`script.js`**: Contains the main JavaScript functions for user authentication, cart management, and search functionality.
  - **`thuoc.js`**: Manages the drug slideshow and order quantity on the product detail page.

- **C# Backend Files**:
  - **`Program.cs`**: Entry point for the C# application.
  - **`Startup.cs`**: Configures the application services and middleware.

## Setup

1. **Clone the Repository**:
   Clone this repository to your local machine using:
   ```bash
   git clone <repository-url>
   ```

2. **Web Server Setup**:
   - Place the HTML, CSS, and JavaScript files in the appropriate directory on your web server.
   - If using a local server like XAMPP, place the files in the `htdocs` folder.

3. **API Server Setup**:
   - Make sure the API server (e.g., a Node.js or C# API) is running and accessible. The frontend makes API calls to endpoints like `http://localhost:5222/api/`.

4. **Update API Endpoints**:
   - Update the API endpoints in the JavaScript files (`script.js`, `thuoc.js`) if your API server is running on a different URL or port.

## Usage

### 1. Admin Interface (`admin.html`)
- **Manage Users**:
  - View, add, and delete users.
  - The admin can add new users with roles like "admin", "seller", or "buyer".
- **Logout**: The admin can log out of the system using the "Đăng xuất" button.

### 2. Seller Interface (`seller.html`)
- **View Drugs**:
  - The seller can view the list of available drugs along with their details.
- **Add/Edit/Delete Drugs**:
  - The seller can add new drugs, edit existing ones, or delete drugs from the inventory.
- **Logout**: The seller can log out using the "Đăng xuất" button.

### 3. Buyer Interface (`main.html`)
- **Search and Browse**:
  - Buyers can search for drugs using the search bar or browse categories.
- **Login/Register**:
  - Buyers can log in or register using the popup form.
- **Add to Cart**:
  - Buyers can add drugs to their cart and view the cart's contents.
- **Logout**: Buyers can log out using the "Đăng xuất" button after logging in.

### 4. Drug Detail Page (`thuoc.html`)
- **View Drug Details**:
  - Buyers can view detailed information about a specific drug.
- **Order Drug**:
  - Buyers can choose the quantity and add the drug to their cart.

## Scripts

### `script.js`
Contains functions for:
- **User Authentication**: Handles login and registration functionality.
- **Search Suggestions**: Fetches and displays search suggestions based on user input.
- **Cart Management**: Manages adding items to the cart and displaying cart contents.

### `thuoc.js`
Manages the following:
- **Slideshow**: Displays a slideshow of drug images on the product detail page.
- **Order Management**: Handles adding drugs to the cart and managing order quantities.

## C# Backend

- **`Program.cs`**: The entry point of the backend application. It configures and runs the application.
- **`Startup.cs`**: Configures services and middleware for the application.

## Customization

- **API Endpoints**: Update the API endpoints in the JavaScript files to match your backend server URL.
- **Styling**: Modify the CSS files to change the look and feel of the application.
- **Data**: Update the data in the database to reflect the actual inventory and user information.

## Troubleshooting

- **API Errors**: Check the browser console for API error messages and ensure the API server is running and accessible.
- **Authentication Issues**: Ensure the API server correctly handles authentication and returns appropriate responses.

## Acknowledgments

Thanks to the developers of the open-source libraries and frameworks used in this project, such as Bootstrap, FontAwesome, and others.

---
