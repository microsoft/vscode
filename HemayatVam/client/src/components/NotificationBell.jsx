export default function NotificationBell() {
  return <div className="relative">
    <i className="ri-notification-3-line text-2xl"></i>
    <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white rounded-full px-1">3</span>
  </div>;
}
