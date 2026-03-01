//go:build linux && amd64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/lib/linux_amd64 -ltalon
#cgo LDFLAGS: -lm -ldl -lpthread
*/
import "C"
