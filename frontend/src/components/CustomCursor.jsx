import { useEffect, useRef, useState } from "react";

export default function CustomCursor() {
  const cursorDotRef = useRef(null);
  const cursorRingRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;

    let mouseX = -100, mouseY = -100;
    let ringX = -100, ringY = -100;
    let animFrame;

    const moveCursor = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
    };

    const animateRing = () => {
      // Smooth trailing with lerp
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
      animFrame = requestAnimationFrame(animateRing);
    };

    const handleMouseOver = (e) => {
      if (e.target.matches("button, a, input, [data-cursor-expand], label, select")) {
        setIsHovering(true);
      }
    };

    const handleMouseOut = (e) => {
      if (e.target.matches("button, a, input, [data-cursor-expand], label, select")) {
        setIsHovering(false);
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", handleMouseOver);
    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    animFrame = requestAnimationFrame(animateRing);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", handleMouseOver);
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  return (
    <>
      {/* DOT */}
      <div
        ref={cursorDotRef}
        style={{
          position: "fixed",
          top: "-4px",
          left: "-4px",
          width: "8px",
          height: "8px",
          background: "#c2410c",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 99999,
          willChange: "transform",
          transition: isClicking ? "width 0.1s, height 0.1s" : "none",
          transform: "translate(-100px,-100px)",
        }}
      />
      {/* RING */}
      <div
        ref={cursorRingRef}
        style={{
          position: "fixed",
          top: isHovering ? "-20px" : "-16px",
          left: isHovering ? "-20px" : "-16px",
          width: isHovering ? "40px" : "32px",
          height: isHovering ? "40px" : "32px",
          border: `2px solid ${isHovering ? "#c2410c" : "rgba(194,65,12,0.5)"}`,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 99998,
          willChange: "transform",
          transition: "width 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1), border-color 0.25s, top 0.25s, left 0.25s, opacity 0.2s",
          opacity: isClicking ? 0.4 : 1,
          mixBlendMode: "multiply",
          transform: "translate(-100px,-100px)",
          backdropFilter: isHovering ? "blur(2px)" : "none",
        }}
      />
    </>
  );
}
