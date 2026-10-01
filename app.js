let products = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let token = localStorage.getItem("token");

function money(n) { return Number(n).toLocaleString("en-IN"); }

async function loadProducts() {
  const res = await fetch("/api/products");
  products = await res.json();

  if (!products.length) {
    await fetch("/api/seed", { method: "POST" });
    const again = await fetch("/api/products");
    products = await again.json();
  }

  renderProducts();
  renderCart();
}

function renderProducts() {
  document.getElementById("products").innerHTML = products.map(p => `
    <div class="card">
      <img src="${p.image}" alt="${p.name}">
      <div class="card-body">
        <h3>${p.name}</h3>
        <p>${p.description}</p>
        <small>Category: ${p.category} | Stock: ${p.stock}</small>
        <div class="price">₹${money(p.price)}</div>
        <button class="primary" onclick="addToCart('${p._id}')">Add to Cart</button>
      </div>
    </div>
  `).join("");
}

function addToCart(id) {
  const p = products.find(x => x._id === id);
  if (!p || p.stock < 1) return toast("Product is out of stock");

  const existing = cart.find(x => x.productId === id);
  if (existing) existing.quantity++;
  else cart.push({ productId: id, name: p.name, price: p.price, quantity: 1 });

  saveCart();
  toast("Added to cart");
}

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  document.getElementById("cartCount").textContent = cart.reduce((s, x) => s + x.quantity, 0);
  const box = document.getElementById("cartItems");

  if (!cart.length) {
    box.innerHTML = "<p>Your cart is empty.</p>";
    document.getElementById("cartTotal").textContent = "0";
    return;
  }

  box.innerHTML = cart.map((x, i) => `
    <div class="cart-row">
      <strong>${x.name}</strong>
      <p>₹${money(x.price)} × ${x.quantity} = ₹${money(x.price * x.quantity)}</p>
      <button onclick="changeQty(${i}, -1)">−</button>
      <button onclick="changeQty(${i}, 1)">+</button>
      <button onclick="removeCart(${i})">Remove</button>
    </div>
  `).join("");

  document.getElementById("cartTotal").textContent =
    money(cart.reduce((s, x) => s + x.price * x.quantity, 0));
}

function changeQty(i, amount) {
  cart[i].quantity += amount;
  if (cart[i].quantity <= 0) cart.splice(i, 1);
  saveCart();
}

function removeCart(i) {
  cart.splice(i, 1);
  saveCart();
}

async function register() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const res = await fetch("/api/register", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  document.getElementById("authMessage").textContent = data.message;

  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
    toast("Account created");
    showSection("home");
  }
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const res = await fetch("/api/login", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  document.getElementById("authMessage").textContent = data.message;

  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
    toast("Logged in successfully");
    showSection("home");
  }
}

async function checkout() {
  if (!cart.length) return toast("Cart is empty");
  if (!token) {
    toast("Please login first");
    showSection("login");
    return;
  }

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${token}`},
    body: JSON.stringify({ items: cart.map(x => ({ productId: x.productId, quantity: x.quantity })) })
  });
  const data = await res.json();

  if (!res.ok) return toast(data.message);

  cart = [];
  saveCart();
  await loadProducts();
  toast("Order placed successfully");
  showSection("orders");
  loadOrders();
}

async function loadOrders() {
  if (!token) {
    document.getElementById("ordersList").innerHTML = "<p>Please login to view orders.</p>";
    return;
  }

  const res = await fetch("/api/orders", {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return;
  const orders = await res.json();

  document.getElementById("ordersList").innerHTML = orders.length
    ? orders.map(o => `
      <div class="order">
        <strong>Order ID:</strong> ${o._id}<br>
        <strong>Status:</strong> ${o.status}<br>
        <strong>Total:</strong> ₹${money(o.total)}<br>
        <small>${new Date(o.createdAt).toLocaleString()}</small>
      </div>
    `).join("")
    : "<p>No orders yet.</p>";
}

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "cart") renderCart();
  if (id === "orders") loadOrders();
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2500);
}

loadProducts();