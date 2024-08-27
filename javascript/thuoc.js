let slideIndex = 1;
showSlides(slideIndex);

// Next/previous controls
function plusSlides(n) {
  showSlides(slideIndex += n);
}

// Thumbnail image controls
function currentSlide(n) {
  showSlides(slideIndex = n);
}

function showSlides(n) {
  let i;
  let slides = document.getElementsByClassName("mySlides");
  let dots = document.getElementsByClassName("dot");
  if (n > slides.length) {slideIndex = 1}
  if (n < 1) {slideIndex = slides.length}
  for (i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  for (i = 0; i < dots.length; i++) {
    dots[i].className = dots[i].className.replace(" active", "");
  }
  slides[slideIndex-1].style.display = "block";
  dots[slideIndex-1].className += " active";
}

let orderQuantity = 0;

function changeButton() {
  if (orderQuantity === 0) {
    var button = document.getElementById('mua');
    button.innerHTML = 'Hết hàng';
    button.classList.add('sold-out');
    button.disabled = true; 
  }
}

function decreaseOrderQuantity() {
  if (orderQuantity > 0) {
    orderQuantity--;
  }
}

function openCart() {
  var cartItems = document.getElementById("cartItems");
  if (cartItems.innerHTML.trim() === "") {
      cartItems.innerHTML = "Giỏ hàng của bạn đang trống.";
      cartItems.style.display = "block";
  } else if (cartItems.style.display === "none") {
      cartItems.style.display = "block";
      // Ở đây bạn cần viết mã JavaScript để thêm các món đồ vào giỏ hàng
      // Ví dụ: fetch danh sách món đồ từ server và hiển thị nó trong #cartItems
  } else {
      cartItems.style.display = "none";
  }
}