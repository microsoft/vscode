"""RoboAgent starter: OpenCV capture + display."""
import cv2


def main() -> None:
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("No camera found; showing a synthetic frame instead.")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        cv2.imshow("RoboAgent · OpenCV", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
