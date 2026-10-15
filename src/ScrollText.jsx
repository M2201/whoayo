import { useEffect } from "react";

export default function ScrollText({ rootRef }) {
  useEffect(() => {
    const root = rootRef.current;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const text = [...root.querySelectorAll("[data-scroll-reveal]")];
    let observer;
    const reveal = (element) => {
      element.dataset.revealState = "visible";
      observer?.unobserve(element);
    };
    const setup = () => {
      observer?.disconnect();
      root.dataset.scrollMotion = media.matches ? "reduced" : "ready";
      if (media.matches || !("IntersectionObserver" in window)) {
        text.forEach(reveal);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) reveal(entry.target);
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      for (const element of text) {
        // Never hide text already visible, focused, or previously revealed.
        if (
          element.dataset.revealState === "visible" ||
          element.getBoundingClientRect().top < innerHeight * 0.92 ||
          element.contains(document.activeElement)
        ) {
          reveal(element);
        } else {
          element.dataset.revealState = "pending";
          observer.observe(element);
        }
      }
    };
    const focus = (event) => {
      const element = event.target.closest("[data-scroll-reveal]");
      if (element) reveal(element);
    };
    setup();
    root.addEventListener("focusin", focus);
    media.addEventListener("change", setup);
    return () => {
      observer?.disconnect();
      root.removeEventListener("focusin", focus);
      media.removeEventListener("change", setup);
      delete root.dataset.scrollMotion;
      for (const element of text) delete element.dataset.revealState;
    };
  }, [rootRef]);
  return null;
}
