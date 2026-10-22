import { fireEvent, render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ navigate: vi.fn(), login: vi.fn(), me: null as { id: string; role: string } | null }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/pd/store", () => ({
  login: state.login,
  useDB: () => ({ org: { name: "Test organization" }, users: [] }),
  useHydrated: () => true,
  useMe: () => state.me,
}));
import { Route } from "@/routes/index";

afterEach(() => { cleanup(); vi.clearAllMocks(); state.me = null; });
describe("default login destination", () => {
  for (const role of ["requestor", "approver", "admin", "procurement", "finance"]) {
    it(`opens Requests after ${role} signs in`, () => {
      state.login.mockReturnValue({ id: "user", role });
      const Component = (Route as unknown as { component: () => React.ReactNode }).component;
      const screen = render(<Component />);
      fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
      expect(state.navigate).toHaveBeenCalledWith({ to: "/app/requests", replace: true });
    });
  }
  it("opens Requests when a signed-in user returns to the login page", async () => {
    state.me = { id: "user", role: "approver" };
    const Component = (Route as unknown as { component: () => React.ReactNode }).component;
    render(<Component />);
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith({ to: "/app/requests", replace: true }));
  });
});