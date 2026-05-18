import { React } from "@webpack/common";

import { getPinsMode, subscribePinsMode, togglePinsMode } from "../store";

export function ServerListButton() {
    const [active, setActive] = React.useState(getPinsMode());

    React.useEffect(() => {
        return subscribePinsMode(() => setActive(getPinsMode()));
    }, []);

    return (
        <div
            className={"vc-cp-server-btn" + (active ? " active" : "")}
            onClick={() => togglePinsMode()}
            title="Channel Pins"
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16 9V4l1 0c0.55 0 1-0.45 1-1s-0.45-1-1-1H7C6.45 2 6 2.45 6 3s0.45 1 1 1l1 0v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
            </svg>
        </div>
    );
}
