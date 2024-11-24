# Đóng góp cho VS Code

Chào mừng và cảm ơn bạn đã quan tâm đến việc đóng góp cho VS Code!

Có một số cách để bạn có thể đóng góp, ngoài việc viết mã. Mục tiêu của tài liệu này là cung cấp tổng quan cấp cao về cách bạn có thể tham gia.

## Đặt câu hỏi

Bạn có câu hỏi nào không? Thay vì mở một vấn đề, hãy hỏi trên [Stack Overflow](https://stackoverflow.com/questions/tagged/visual-studio-code) bằng cách sử dụng thẻ `visual-studio-code`.

Cộng đồng năng động sẽ rất mong muốn được hỗ trợ bạn. Câu hỏi được diễn đạt rõ ràng của bạn sẽ đóng vai trò là nguồn tài nguyên cho những người khác đang tìm kiếm sự trợ giúp.

## Cung cấp phản hồi

Chúng tôi hoan nghênh các ý kiến ​​và phản hồi của bạn và nhóm phát triển có thể liên hệ qua một số kênh khác nhau.

Xem trang wiki [Kênh phản hồi](https://github.com/microsoft/vscode/wiki/Feedback-Channels) để biết chi tiết về cách chia sẻ suy nghĩ của bạn.

## Báo cáo sự cố

Bạn đã xác định được sự cố có thể tái tạo trong VS Code chưa? Bạn có yêu cầu tính năng nào không? Chúng tôi muốn nghe về điều đó! Sau đây là cách bạn có thể báo cáo sự cố của mình một cách hiệu quả nhất có thể.

### Xác định nơi báo cáo

Dự án VS Code được phân phối trên nhiều kho lưu trữ. Hãy thử nộp sự cố vào kho lưu trữ chính xác. Kiểm tra danh sách [Dự án liên quan](https://github.com/microsoft/vscode/wiki/Related-Projects) nếu bạn không chắc kho lưu trữ nào là chính xác.

Bạn có thể tạo lại sự cố ngay cả sau khi [vô hiệu hóa tất cả tiện ích mở rộng](https://code.visualstudio.com/docs/editor/extension-gallery#_disable-an-extension) không? Nếu bạn thấy sự cố là do tiện ích mở rộng bạn đã cài đặt, vui lòng nộp sự cố trực tiếp vào kho lưu trữ của tiện ích mở rộng đó.

### Tìm kiếm sự cố hiện có

Trước khi tạo sự cố mới, vui lòng tìm kiếm trong [các sự cố đang mở](https://github.com/microsoft/vscode/issues) để xem sự cố hoặc yêu cầu tính năng đã được gửi chưa.

Đảm bảo quét qua các yêu cầu tính năng [phổ biến nhất](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc).

Nếu bạn thấy sự cố của mình đã tồn tại, hãy đưa ra các bình luận có liên quan và thêm [phản ứng](https://github.com/blog/2119-add-reactions-to-pull-requests-issues-and-comments) của bạn. Sử dụng phản ứng thay cho bình luận "+1":

* 👍 - upvote
* 👎 - downvote

Nếu bạn không tìm thấy sự cố hiện có nào mô tả lỗi hoặc tính năng của mình, hãy tạo sự cố mới bằng cách sử dụng các hướng dẫn bên dưới.

### Viết báo cáo lỗi và yêu cầu tính năng tốt

Gửi một vấn đề duy nhất cho mỗi vấn đề và yêu cầu tính năng. Không liệt kê nhiều lỗi hoặc yêu cầu tính năng trong cùng một vấn đề.

Không thêm vấn đề của bạn dưới dạng bình luận vào vấn đề hiện có trừ khi đó là vấn đề đầu vào giống hệt nhau. Nhiều vấn đề trông giống nhau nhưng có nguyên nhân khác nhau.

Bạn cung cấp càng nhiều thông tin thì khả năng ai đó tái tạo vấn đề và tìm ra cách khắc phục càng cao.

Công cụ tích hợp để báo cáo vấn đề, mà bạn có thể truy cập bằng cách sử dụng `Báo cáo vấn đề` trong menu Trợ giúp của VS Code, có thể giúp hợp lý hóa quy trình này bằng cách tự động cung cấp phiên bản VS Code, tất cả các tiện ích mở rộng đã cài đặt và thông tin hệ thống của bạn. Ngoài ra, công cụ sẽ tìm kiếm trong số các vấn đề hiện có để xem liệu có vấn đề tương tự nào đã tồn tại hay không.

Vui lòng bao gồm các thông tin sau với mỗi sự cố:

* Phiên bản VS Code
* Hệ điều hành của bạn
* Danh sách các tiện ích mở rộng mà bạn đã cài đặt
* Các bước có thể tái tạo (1... 2... 3...) gây ra sự cố
* Những gì bạn mong đợi thấy, so với những gì bạn thực sự thấy
* Hình ảnh, hoạt ảnh hoặc liên kết đến video cho thấy sự cố đang xảy ra
* Một đoạn mã minh họa sự cố hoặc liên kết đến kho lưu trữ mã mà các nhà phát triển có thể dễ dàng kéo xuống để tạo lại sự cố cục bộ
* **Lưu ý:** Vì các nhà phát triển cần sao chép và dán đoạn mã, nên việc bao gồm đoạn mã dưới dạng tệp phương tiện (tức là .gif) là không đủ.
* Lỗi từ Bảng điều khiển Công cụ dành cho nhà phát triển (mở từ menu: Trợ giúp > Chuyển đổi Công cụ dành cho nhà phát triển)

### Tạo Yêu cầu kéo

* Vui lòng tham khảo bài viết về [tạo yêu cầu kéo](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests) và đóng góp cho dự án này.

### Danh sách kiểm tra cuối cùng

Vui lòng nhớ thực hiện những điều sau:

* [ ] Tìm kiếm kho lưu trữ sự cố để đảm bảo báo cáo của bạn là sự cố mới
* [ ] Tạo lại sự cố sau khi tắt tất cả tiện ích mở rộng
* [ ] Đơn giản hóa mã của bạn xung quanh sự cố để cô lập vấn đề tốt hơn

Đừng cảm thấy tệ nếu các nhà phát triển không thể tái tạo sự cố ngay lập tức. Họ chỉ yêu cầu thêm thông tin!

### Theo dõi sự cố của bạn

Sau khi gửi, báo cáo của bạn sẽ được đưa vào quy trình làm việc [theo dõi sự cố](https://github.com/microsoft/vscode/wiki/Issue-Tracking). Hãy đảm bảo hiểu những gì sẽ xảy ra tiếp theo để bạn biết những gì mong đợi và cách tiếp tục hỗ trợ trong suốt quá trình.

## Quản lý sự cố tự động

Chúng tôi sử dụng GitHub Actions để giúp chúng tôi quản lý sự cố. Các Hành động này và mô tả của chúng có thể được [xem tại đây](https://github.com/microsoft/vscode-github-triage-actions). Một số ví dụ về những gì các Hành động này thực hiện là:

* Tự động đóng bất kỳ sự cố nào được đánh dấu là `info-needed` nếu không có phản hồi trong 7 ngày qua.
* Tự động khóa các sự cố sau 45 ngày kể từ khi chúng được đóng.
* Tự động triển khai [đường ống yêu cầu tính năng] của VS Code (https://github.com/microsoft/vscode/wiki/Issues-Triaging#managing-feature-requests).

Nếu bạn tin rằng bot đã làm sai điều gì đó, vui lòng mở một sự cố mới và cho chúng tôi biết.

## Đóng góp bản sửa lỗi

Nếu bạn quan tâm đến việc viết mã để sửa sự cố, vui lòng xem [Cách đóng góp] (https://github.com/microsoft/vscode/wiki/How-to-Contribute) trong wiki.

## Cảm ơn bạn

Những đóng góp của bạn cho mã nguồn mở, dù lớn hay nhỏ, đều giúp các dự án tuyệt vời như thế này trở nên khả thi. Cảm ơn bạn đã dành thời gian đóng góp.
