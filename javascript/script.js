
function searchFunction() {
  // Khai báo biến
  var input, filter, ul, li, i, txtValue;
  input = document.getElementById('mySearch');
  filter = input.value.toUpperCase();
  ul = document.getElementById("myList");
  li = ul.getElementsByTagName('li');

  // Lặp qua tất cả các mục trong danh sách và ẩn những mục không khớp với từ khóa tìm kiếm
  for (i = 0; i < li.length; i++) {
      txtValue = li[i].textContent || li[i].innerText;
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
          li[i].style.display = "";
      } else {
          li[i].style.display = "none";
      }
  }
}